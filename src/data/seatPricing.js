// Single source of truth for company seat package pricing.
// Every seat in a package is provisioned at one specific subscription plan
// (Standard, Storage+, Storage Pro, Storage Max, or Creator Studio) — the
// same plans sold individually — so technicians always know exactly what
// each seat includes. Seat packages are sold by the year only.

import { PLANS, PLAN_ORDER } from './plans'

export { PLANS, PLAN_ORDER }

// Bigger packages earn a modest per-seat discount off that plan's list
// annual price, while still clearing MINIMUM_HEALTHY_MARGIN_PCT below.
export const SEAT_VOLUME_DISCOUNTS = [
  { id: 'tier-1-9', label: '1–9 seats', minSeats: 1, maxSeats: 9, discountPct: 0 },
  { id: 'tier-10-24', label: '10–24 seats', minSeats: 10, maxSeats: 24, discountPct: 8 },
  { id: 'tier-25-49', label: '25–49 seats', minSeats: 25, maxSeats: 49, discountPct: 14 },
  { id: 'tier-50-99', label: '50–99 seats', minSeats: 50, maxSeats: 99, discountPct: 20 },
  { id: 'tier-100-249', label: '100–249 seats', minSeats: 100, maxSeats: 249, discountPct: 26 },
  { id: 'tier-250-plus', label: '250+ seats', minSeats: 250, maxSeats: Infinity, discountPct: 32 },
]

// Technicians should not quote below this margin without a manager override.
export const MINIMUM_HEALTHY_MARGIN_PCT = 55

export const getVolumeTierForCount = (seatCount) => {
  const count = Math.max(1, Number(seatCount) || 1)
  return SEAT_VOLUME_DISCOUNTS.find((tier) => count >= tier.minSeats && count <= tier.maxSeats) ?? SEAT_VOLUME_DISCOUNTS[SEAT_VOLUME_DISCOUNTS.length - 1]
}

export const getPlan = (planKey) => PLANS[planKey] ?? PLANS.premium

// Our cost of goods per seat/year at a plan's full list price — hosting,
// storage, the plan's included AI credits, and support — derived from that
// plan's own published margin so it never drifts out of sync with plans.js.
export const getPlanCogsPerSeatYear = (planKey) => {
  const plan = getPlan(planKey)
  return plan.annualPrice * (1 - plan.marginPct / 100)
}

export const getPlanTierPrice = (planKey, seatCount) => {
  const plan = getPlan(planKey)
  const tier = getVolumeTierForCount(seatCount)
  return { tier, pricePerSeatYear: Math.round(plan.annualPrice * (1 - tier.discountPct / 100)) }
}

// Builds a full quote for a plan + seat count, optionally overriding the
// per-seat price (e.g. a technician negotiating within an approved floor).
export const getSeatQuote = (planKey, seatCount, priceOverride) => {
  const plan = getPlan(planKey)
  const count = Math.max(1, Math.round(Number(seatCount) || 1))
  const { tier, pricePerSeatYear: tierPrice } = getPlanTierPrice(planKey, count)
  const pricePerSeatYear = Number(priceOverride) > 0 ? Number(priceOverride) : tierPrice
  const cogsPerSeatYear = getPlanCogsPerSeatYear(planKey)
  const totalAnnualPrice = pricePerSeatYear * count
  const totalCogs = cogsPerSeatYear * count
  const grossMargin = totalAnnualPrice - totalCogs
  const marginPct = totalAnnualPrice > 0 ? (grossMargin / totalAnnualPrice) * 100 : 0
  return {
    plan,
    count,
    tier,
    pricePerSeatYear,
    cogsPerSeatYear,
    totalAnnualPrice,
    totalCogs,
    grossMargin,
    marginPct,
    belowFloor: marginPct < MINIMUM_HEALTHY_MARGIN_PCT,
  }
}

export const formatUsd = (value) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

// Pulls a requested seat count out of a "Company Seats Package Request"
// ticket's details text, e.g. "Requested seats: 25\n\n...".
export const parseRequestedSeatsFromDetails = (details) => {
  const match = /requested seats:\s*(\d+)/i.exec(details || '')
  return match ? Number(match[1]) : null
}

export const buildQuoteMessage = ({ companyName, quote }) => {
  const { plan, count, pricePerSeatYear, totalAnnualPrice } = quote
  return [
    `Thanks for your interest in an EchoAI company package${companyName ? ` for ${companyName}` : ''}!`,
    '',
    `Quote: ${count} seat${count === 1 ? '' : 's'} on the ${plan.label} plan (${plan.storageGb} GB storage + ${plan.includedAiCredits.toLocaleString('en-US')} AI credits/month, per seat) at $${pricePerSeatYear.toLocaleString('en-US')} per seat, billed annually.`,
    `Total: ${formatUsd(totalAnnualPrice)} / year.`,
    '',
    'Seat packages are billed annually only. Reply to this ticket to confirm and we will activate your seats.',
  ].join('\n')
}

