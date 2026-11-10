import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_METRICS, PLAN_LIMITS, PROVIDER_METRICS, capacityStatus, formatBytes,
  readingStatus, projectMonthlyUsage, growthForecast, providerAllowance, callInfrastructureRpc,
} from './infrastructureUsage.js'

test('capacity thresholds are exactly 70% yellow and 90% red, including exceeded limits', () => {
  assert.equal(capacityStatus(69.99, 100).level, 'good')
  assert.equal(capacityStatus(70, 100).level, 'warning')
  assert.equal(capacityStatus(89.99, 100).level, 'warning')
  assert.equal(capacityStatus(90, 100).level, 'danger')
  assert.match(capacityStatus(100, 100).label, /Limit reached/)
  assert.equal(capacityStatus(200, 100).percent, 200)
  assert.equal(capacityStatus(0, 100).level, 'good')
})

test('missing and invalid measurements never report green or zero usage', () => {
  for (const used of [null, undefined, NaN, Infinity, -1]) assert.equal(capacityStatus(used, 100).level, 'unknown')
  for (const limit of [0, -1, null, NaN, Infinity]) assert.equal(capacityStatus(1, limit).level, 'unknown')
  assert.equal(formatBytes(null), 'Unknown')
  assert.equal(formatBytes(undefined), 'Unknown')
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1_000_000_000), '1.00 GB')
  assert.equal(formatBytes('500000000'), '500.0 MB')
})

const now = new Date('2026-11-10T12:00:00Z')
const reading = { value: 95, period_start: '2026-11-01', period_end: '2026-11-30', measured_at: now.toISOString() }

test('provider freshness distinguishes missing, stale and out-of-period readings', () => {
  assert.equal(readingStatus(null, now), 'Not connected')
  assert.equal(readingStatus(reading, now), 'Manual provider reading')
  assert.match(readingStatus({ ...reading, measured_at: '2026-11-09T11:59:59Z' }, now), /Stale/)
  assert.match(readingStatus({ ...reading, period_end: '2026-11-09' }, now), /Outside/)
  assert.match(readingStatus({ ...reading, period_start: '2026-11-11' }, now), /Outside/)
  assert.equal(readingStatus({ ...reading, value: null }, now), 'Invalid reading')
  assert.equal(readingStatus({ ...reading, measured_at: 'invalid' }, now), 'Invalid reading')
  assert.match(readingStatus({ ...reading, measured_at: '2026-11-11T00:00:00Z' }, now), /future/)
})

test('billing projection uses the saved measurement timestamp, not elapsed time since reading', () => {
  assert.equal(projectMonthlyUsage(reading, now), 300)
  assert.equal(projectMonthlyUsage(reading, new Date('2026-11-11T00:00:00Z')), 300)
  assert.equal(projectMonthlyUsage({ ...reading, measured_at: '2026-11-01T12:00:00Z' }, new Date('2026-11-01T12:00:00Z')), null)
  assert.equal(projectMonthlyUsage(reading, new Date('2026-11-12')), null)
})

test('growth forecast requires distinct days and positive measured net growth', () => {
  const snapshots = [
    { day: '2026-11-01', storage_bytes: 100 },
    { day: '2026-11-10', storage_bytes: 190 },
  ]
  assert.deepEqual(growthForecast(snapshots, 'storage_bytes', 1000), { dailyBytes: 10, daysToWarning: 51, sampleDays: 9 })
  assert.equal(growthForecast(snapshots.slice(0, 1), 'storage_bytes', 1000), null)
  assert.equal(growthForecast([snapshots[0], snapshots[0]], 'storage_bytes', 1000), null)
  assert.equal(growthForecast([...snapshots].reverse(), 'storage_bytes', 1000), null)
  assert.equal(growthForecast(snapshots, 'storage_bytes', 100).daysToWarning, 0)
})

test('provider definitions and activity metrics cover the plan quotas and media categories', () => {
  for (const metric of PROVIDER_METRICS.filter((item) => item.id.startsWith('supabase_'))) {
    assert.ok(PLAN_LIMITS.free[metric.id] > 0)
    assert.ok(PLAN_LIMITS.pro[metric.id] > PLAN_LIMITS.free[metric.id])
  }
  for (const type of ['video', 'image', 'text']) assert.ok(ACTIVITY_METRICS.some(([id]) => id === `published_${type}`))
})

test('upgrading and downgrading recalculate thresholds without changing actual consumption', () => {
  const used = 950_000_000
  assert.equal(capacityStatus(used, PLAN_LIMITS.free.storage).level, 'danger')
  assert.equal(capacityStatus(used, PLAN_LIMITS.pro.storage).level, 'good')
  assert.equal(PLAN_LIMITS.pro.storage - used, 99_050_000_000)
  const metric = PROVIDER_METRICS.find((item) => item.id === 'supabase_egress')
  assert.equal(providerAllowance(metric, { supabase_plan: 'free' }), 5_000_000_000)
  assert.equal(providerAllowance(metric, { supabase_plan: 'pro' }), 250_000_000_000)
  const awsMetric = PROVIDER_METRICS.find((item) => item.id === 'aws_transfer')
  assert.equal(providerAllowance(awsMetric, { aws_plan: 'free' }), 15_000_000_000)
  assert.equal(providerAllowance(awsMetric, { aws_plan: 'paid' }), null)
  assert.equal(providerAllowance(awsMetric, { aws_plan: 'unknown' }), null)
  assert.equal(capacityStatus(used, PLAN_LIMITS.free.storage).level, 'danger')
})

test('billing-period rollover invalidates old consumption rather than reporting zero', () => {
  const previous = { ...reading, measured_at: '2026-11-30T23:59:00Z' }
  const rolledOver = new Date('2026-12-01T00:01:00Z')
  assert.equal(readingStatus(previous, rolledOver), 'Outside current billing period')
  assert.equal(projectMonthlyUsage(previous, rolledOver), null)
  assert.equal(previous.value, 95)
})

test('RPC calls surface missing configuration, permission and deployment errors', async () => {
  await assert.rejects(callInfrastructureRpc(null, 'get_infrastructure_usage'), /not configured/)
  await assert.rejects(callInfrastructureRpc({ rpc: async () => ({ error: { message: 'permission denied' } }) }, 'get_infrastructure_usage'), /permission denied.*migration/)
  const client = { rpc: async (name, args) => ({ data: { name, args }, error: null }) }
  assert.deepEqual(await callInfrastructureRpc(client, 'get_infrastructure_usage', { p_day: '2026-11-10' }), { name: 'get_infrastructure_usage', args: { p_day: '2026-11-10' } })
})
