import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const fixturePath = '/__infrastructure-test'
const fixtureModule = 'virtual:infrastructure-fixture'
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script type="module" src="/@id/${fixtureModule}"></script></body></html>`
const fixtureCode = `
  import React from 'react'
  import { createRoot } from 'react-dom/client'
  import '/src/index.css'
  import '/src/App.css'
  import { InfrastructureUsagePanel } from '/src/components/InfrastructureUsagePanel.jsx'
  import { AdminPanel } from '/src/components/AdminPanel.jsx'
  const today = new Date().toISOString().slice(0, 10)
  const summary = {
    measuredAt: new Date().toISOString(), selectedDay: today,
    settings: { supabase_plan: 'free', plan_confirmed: false, aws_plan: 'unknown', aws_expires_on: null, tracking_started_at: new Date().toISOString() },
    databaseBytes: 350000000, storageBytes: 950000000, users: 16, betaUsers: 16, activeSubscriptions: 0,
    queue: { scheduled: 5, overdue: 2, publishing: 1, stuck: 0, failed: 1 },
    activity: [
      { metric: 'uploaded_video', daily: 2, month: 8, total: 15, bytes: 900000000, daily_bytes: 100000000 },
      { metric: 'published_text', daily: 3, month: 10, total: 20, bytes: 0, daily_bytes: 0 },
    ],
    history: [{ day: today, metric: 'uploaded_video', quantity: 2, bytes: 100000000 }],
    buckets: [{ id: 'social-media', objects: 15, bytes: 950000000, file_size_limit: 2147483648, unknown_size: 0 }],
    tables: [{ name: 'scheduled_posts', bytes: 2000000 }], snapshots: [], readings: [],
  }
  window.__calls = []
  window.__fail = false
  const client = {
    async rpc(name, args) {
      window.__calls.push({ name, args })
      if (window.__fail) return { error: { message: 'Usage service unavailable' } }
      if (name === 'save_infrastructure_settings') {
        summary.settings = { ...summary.settings, supabase_plan: args.p_supabase_plan, aws_plan: args.p_aws_plan, plan_confirmed: true, aws_expires_on: args.p_aws_expires_on }
        return { data: null }
      }
      if (name === 'save_infrastructure_reading') {
        summary.readings = [{ metric: args.p_metric, value: args.p_value, period_start: args.p_period_start, period_end: args.p_period_end, measured_at: new Date().toISOString() }]
        return { data: null }
      }
      return { data: structuredClone({ ...summary, selectedDay: args.p_day }) }
    },
  }
  const params = new URLSearchParams(location.search)
  const navigation = params.has('navigation')
  const element = navigation ? React.createElement(AdminPanel, {
    currentUser: { id: 'staff', role: params.get('role') || 'admin' },
    teamMembers: [], licenses: [], tickets: [], purchaseHistory: [], companySeats: [], alerts: [],
    socialPlatformReadiness: [],
    featureFlags: [], promoCodes: [], expenses: [], payroll: [], taxRecords: [], refunds: [], financialTasks: [], announcements: {},
  }) : React.createElement(InfrastructureUsagePanel, { client: params.has('unconfigured') ? null : client })
  createRoot(document.getElementById('root')).render(element)
`

test('infrastructure dashboard metrics, warnings, refresh, saved configuration and responsive layout', async (t) => {
  const server = await createServer({
    cacheDir: 'node_modules/.vite-infrastructure-test',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'infrastructure-fixture',
      resolveId: (id) => id === fixtureModule ? id : undefined,
      load: (id) => id === fixtureModule ? fixtureCode : undefined,
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url?.split('?')[0] !== fixturePath) return next()
          try {
            res.setHeader('Content-Type', 'text/html')
            res.end(await vite.transformIndexHtml(fixturePath, fixture))
          } catch (error) {
            next(error)
          }
        })
      },
    }],
  })
  t.after(() => server.close())
  await server.listen()
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = `${server.resolvedUrls.local[0].replace(/\/$/, '')}${fixturePath}`
  await page.clock.install()
  await page.goto(url)
  await page.getByRole('heading', { name: 'Infrastructure & Usage', exact: true }).waitFor()
  const database = page.locator('.infra-capacity').filter({ has: page.getByRole('heading', { name: 'Database', exact: true }) })
  const storage = page.locator('.infra-capacity').filter({ has: page.getByRole('heading', { name: 'Stored files', exact: true }) })
  assert.match(await database.innerText(), /350.0 MB \/ 500.0 MB/)
  assert.match(await database.locator('.infra-warning').innerText(), /70.0%/)
  assert.match(await storage.locator('.infra-danger').innerText(), /95.0%/)
  assert.equal(await page.getByText('Plan not confirmed', { exact: true }).count(), 1)
  const videoRow = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Videos uploaded', exact: true }) })
  assert.deepEqual(await videoRow.getByRole('cell').allTextContents(), ['2', '8', '15', '100.0 MB / 900.0 MB'])
  const providerRows = page.getByRole('row').filter({ hasText: /Supabase uncached transfer|Supabase function invocations|Amplify data served/ })
  assert.equal(await providerRows.locator('.infra-unknown').count(), 3)
  assert.match(await page.getByText(/posts overdue by 5/).innerText(), /2 posts overdue/)

  await page.getByLabel('Activity day (UTC)').fill('2026-10-01')
  await page.waitForFunction(() => window.__calls.some((call) => call.name === 'get_infrastructure_usage' && call.args.p_day === '2026-10-01'))
  await page.locator('.infra-table thead').filter({ hasText: '2026-10-01 (UTC)' }).waitFor()

  // The actual live timer fetches new server data and does not reload the page.
  const callsBefore = await page.evaluate(() => window.__calls.length)
  await page.clock.fastForward(60_001)
  await page.waitForFunction((before) => window.__calls.length > before, callsBefore)
  await page.getByLabel('Live refresh every 60 seconds').uncheck()
  await page.getByRole('button', { name: 'Refresh now', exact: true }).waitFor()
  const callsAfterPause = await page.evaluate(() => window.__calls.length)
  await page.clock.fastForward(120_000)
  assert.equal(await page.evaluate(() => window.__calls.length), callsAfterPause)
  await page.clock.resume()

  await page.getByLabel('Supabase plan', { exact: true }).selectOption('pro')
  await page.getByLabel('AWS account plan', { exact: true }).selectOption('paid')
  await page.getByRole('button', { name: 'Confirm plan settings', exact: true }).click()
  await page.waitForFunction(() => window.__calls.some((call) => call.name === 'save_infrastructure_settings' && call.args.p_supabase_plan === 'pro'))
  await page.waitForFunction(() => document.querySelector('.infra-capacity .infra-good'))
  assert.match(await database.innerText(), /8.00 GB/)
  assert.match(await database.innerText(), /350.0 MB \/ 8.00 GB/)
  assert.match(await storage.innerText(), /950.0 MB \/ 100.00 GB/)
  assert.match(await storage.innerText(), /99.05 GB remaining/)
  assert.deepEqual(await videoRow.getByRole('cell').allTextContents(), ['2', '8', '15', '100.0 MB / 900.0 MB'])
  await page.getByText('AWS Paid: no Free-account shutdown deadline', { exact: true }).waitFor()
  assert.match(await page.getByRole('row').filter({ hasText: 'Amplify data served' }).innerText(), /No confirmed fixed allowance/)
  assert.equal(await page.getByText('Plan not confirmed', { exact: true }).count(), 0)

  await page.getByText('Record usage from a provider dashboard', { exact: true }).click()
  await page.getByLabel('Current usage (GB)', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Save provider reading', exact: true }).click()
  await page.waitForFunction(() => window.__calls.some((call) => call.name === 'save_infrastructure_reading' && call.args.p_value === 100000000000))
  await page.getByRole('row').filter({ hasText: 'Supabase uncached transfer' }).getByText('100.00 GB', { exact: true }).waitFor()
  const transferRow = page.getByRole('row').filter({ hasText: 'Supabase uncached transfer' })
  assert.match(await transferRow.innerText(), /40.0%/)
  await page.getByLabel('Supabase plan', { exact: true }).selectOption('free')
  await page.getByLabel('AWS account plan', { exact: true }).selectOption('free')
  await page.getByRole('button', { name: 'Confirm plan settings', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.infra-capacity .infra-warning'))
  await transferRow.getByText('2000.0% · manual reading', { exact: true }).waitFor()
  assert.equal(await transferRow.getByText('100.00 GB', { exact: true }).count(), 1)
  assert.match(await storage.innerText(), /950.0 MB \/ 1.00 GB/)
  assert.deepEqual(await videoRow.getByRole('cell').allTextContents(), ['2', '8', '15', '100.0 MB / 900.0 MB'])
  assert.match(await page.getByRole('row').filter({ hasText: 'Amplify data served' }).innerText(), /15.00 GB/)

  await page.evaluate(() => { window.__fail = true })
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Usage service unavailable' }).waitFor()
  assert.match(await page.getByRole('alert').innerText(), /Displayed data is stale/)
  assert.equal(await videoRow.count(), 1)
  await page.evaluate(() => { window.__fail = false })
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'))

  const periodEnd = await page.getByLabel('Billing period end (UTC, inclusive)').inputValue()
  await page.clock.runFor(1)
  await page.clock.setSystemTime(new Date(`${periodEnd}T23:59:00Z`).getTime() + 120000)
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click()
  await transferRow.getByText('Billing period changed / new reading needed', { exact: true }).waitFor()
  assert.match(await transferRow.innerText(), /Awaiting current-period reading/)
  assert.match(await transferRow.innerText(), /Previous period: 100.00 GB/)
  assert.match(await transferRow.innerText(), /Billing period changed \/ new reading needed/)
  assert.equal(await transferRow.locator('.infra-good').count(), 0)

  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.getByRole('button', { name: 'Refresh now', exact: true }).isVisible(), true)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.ok(await page.locator('.infra-table-scroll').first().evaluate((element) => element.scrollWidth > element.clientWidth))

  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const role of ['admin', 'super_admin', 'it', 'accountant']) {
    await page.goto(`${url}?navigation=1&role=${role}`)
    await page.getByRole('button', { name: 'Platform', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Infrastructure & Usage', exact: true }).count(), role === 'accountant' ? 0 : 1)
  }
  await page.goto(`${url}?unconfigured=1`)
  await page.getByRole('alert').filter({ hasText: 'Supabase is not configured' }).waitFor()
  assert.equal(await page.locator('.infra-capacity').count(), 0)
  assert.deepEqual(errors, [])
})
