// Single source of truth for company seat package pricing.
// Seat packages are sold by the year only — no monthly billing option.
// Technicians use this to quote customers without underselling our margin.

// Hosting, storage, support staffing, and baseline AI token allowance bundled
// into every seat, expressed as our cost per seat per year.
export const SEAT_COGS_PER_SEAT_YEAR = 108

// Volume tiers — bigger packages earn a modest per-seat discount while still
// clearing MINIMUM_HEALTHY_MARGIN_PCT below.
export const SEAT_TIERS = [
  { id: 'tier-1-9', label: '1–9 seats', minSeats: 1, maxSeats: 9, pricePerSeatYear: 349 },
  { id: 'tier-10-24', label: '10–24 seats', minSeats: 10, maxSeats: 24, pricePerSeatYear: 299 },
  { id: 'tier-25-49', label: '25–49 seats', minSeats: 25, maxSeats: 49, pricePerSeatYear: 259 },
  { id: 'tier-50-99', label: '50–99 seats', minSeats: 50, maxSeats: 99, pricePerSeatYear: 229 },
  { id: 'tier-100-249', label: '100–249 seats', minSeats: 100, maxSeats: 249, pricePerSeatYear: 199 },
  { id: 'tier-250-plus', label: '250+ seats', minSeats: 250, maxSeats: Infinity, pricePerSeatYear: 179 },
]

// Technicians should not quote below this margin without a manager override.
export const MINIMUM_HEALTHY_MARGIN_PCT = 55

export const getSeatTierForCount = (seatCount) => {
  const count = Math.max(1, Number(seatCount) || 1)
  return SEAT_TIERS.find((tier) => count >= tier.minSeats && count <= tier.maxSeats) ?? SEAT_TIERS[SEAT_TIERS.length - 1]
}

export const getTierMarginPct = (pricePerSeatYear) =>
  pricePerSeatYear > 0 ? ((pricePerSeatYear - SEAT_COGS_PER_SEAT_YEAR) / pricePerSeatYear) * 100 : 0

// Builds a full quote for a given seat count, optionally overriding the
// per-seat price (e.g. a technician negotiating within an approved floor).
export const getSeatQuote = (seatCount, priceOverride) => {
  const count = Math.max(1, Math.round(Number(seatCount) || 1))
  const tier = getSeatTierForCount(count)
  const pricePerSeatYear = Number(priceOverride) > 0 ? Number(priceOverride) : tier.pricePerSeatYear
  const totalAnnualPrice = pricePerSeatYear * count
  const totalCogs = SEAT_COGS_PER_SEAT_YEAR * count
  const grossMargin = totalAnnualPrice - totalCogs
  const marginPct = totalAnnualPrice > 0 ? (grossMargin / totalAnnualPrice) * 100 : 0
  return {
    count,
    tier,
    pricePerSeatYear,
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
  const { count, pricePerSeatYear, totalAnnualPrice } = quote
  return [
    `Thanks for your interest in an EchoAI company package${companyName ? ` for ${companyName}` : ''}!`,
    '',
    `Quote: ${count} seat${count === 1 ? '' : 's'} at $${pricePerSeatYear.toLocaleString('en-US')} per seat, billed annually.`,
    `Total: ${formatUsd(totalAnnualPrice)} / year.`,
    '',
    'Seat packages are billed annually only. Reply to this ticket to confirm and we will activate your seats.',
  ].join('\n')
}
