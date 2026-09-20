import { useState } from 'react'
import { PLANS, PLAN_ORDER } from '../data/plans'
import './PricingProfitabilityPanel.css'

export function PricingProfitabilityPanel() {
  const [vendorCostAdjustment, setVendorCostAdjustment] = useState(0) // % change in AI vendor costs
  const [customUserCount, setCustomUserCount] = useState(500)
  const customTierDistribution = {
    premium: 100,
  }

  // Target Revenue Allocation Defaults (%)
  const allocation = {
    netProfit: 35,
    payroll: 28,
    taxReserve: 20,
    aiVendors: 11,
    stripeAndHosting: 6,
  }

  // Derived calculations across user distribution
  const avgMonthlyPrice = PLAN_ORDER.reduce(
    (acc, key) => acc + PLANS[key].monthlyPrice * (customTierDistribution[key] / 100),
    0
  )

  const estMonthlyGrossRevenue = customUserCount * avgMonthlyPrice
  const estAnnualGrossRevenue = estMonthlyGrossRevenue * 12

  // Projected expense buckets
  const estStripeAndHosting = estMonthlyGrossRevenue * (allocation.stripeAndHosting / 100)
  const baseAiCost = estMonthlyGrossRevenue * (allocation.aiVendors / 100)
  const estAiVendorCost = baseAiCost * (1 + vendorCostAdjustment / 100)
  const estTaxReserve = estMonthlyGrossRevenue * (allocation.taxReserve / 100)
  const estPayrollBudget = estMonthlyGrossRevenue * (allocation.payroll / 100)
  const estNetProfit = estMonthlyGrossRevenue - (estStripeAndHosting + estAiVendorCost + estTaxReserve + estPayrollBudget)
  const estNetMarginPct = (estNetProfit / estMonthlyGrossRevenue) * 100

  return (
    <div className="profitability-dashboard">
      <div className="profitability-header">
        <div>
          <p className="section-label">Executive Financial Intelligence</p>
          <h2 style={{ margin: '0.2rem 0' }}>📈 Pricing, Unit Economics &amp; Profitability Model</h2>
          <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
            Live model designed to ensure 100% solvency across team payroll, tax reserves, Stripe processing, and AI token overhead.
          </p>
        </div>
      </div>

      {/* Metric Highlights */}
      <div className="profitability-metrics-grid">
        <div className="profitability-stat-card highlight">
          <span>Target Net Profit Margin</span>
          <strong style={{ color: '#059669' }}>~{estNetMarginPct.toFixed(1)}%</strong>
          <small>After all payroll, taxes, and vendor bills</small>
        </div>

        <div className="profitability-stat-card">
          <span>Projected Monthly Run Rate</span>
          <strong style={{ color: '#2563eb' }}>${Math.round(estMonthlyGrossRevenue).toLocaleString()}</strong>
          <small>Based on {customUserCount} active subscribers</small>
        </div>

        <div className="profitability-stat-card">
          <span>Employee &amp; Payroll Pool</span>
          <strong style={{ color: '#0f172a' }}>${Math.round(estPayrollBudget).toLocaleString()} / mo</strong>
          <small>{allocation.payroll}% allocated to staff salaries</small>
        </div>

        <div className="profitability-stat-card">
          <span>Tax Reserve Provision</span>
          <strong style={{ color: '#d97706' }}>${Math.round(estTaxReserve).toLocaleString()} / mo</strong>
          <small>{allocation.taxReserve}% escrow for Fed/State/Corp taxes</small>
        </div>
      </div>

      {/* Revenue Allocation Stacked Waterfall */}
      <div className="allocation-bar-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Every Dollar Allocation Strategy</h3>
            <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.8rem' }}>How each customer subscription dollar is budgeted to protect business health</p>
          </div>
          <span className="badge success">Balanced Model</span>
        </div>

        <div className="allocation-stacked-bar">
          <div className="allocation-segment" style={{ width: `${estNetMarginPct}%`, background: '#10b981' }} title="Net Profit">
            {estNetMarginPct >= 15 ? `Net Profit ${estNetMarginPct.toFixed(0)}%` : ''}
          </div>
          <div className="allocation-segment" style={{ width: `${allocation.payroll}%`, background: '#3b82f6' }} title="Payroll Pool">
            Payroll {allocation.payroll}%
          </div>
          <div className="allocation-segment" style={{ width: `${allocation.taxReserve}%`, background: '#f59e0b' }} title="Tax Reserve">
            Tax {allocation.taxReserve}%
          </div>
          <div className="allocation-segment" style={{ width: `${(estAiVendorCost / estMonthlyGrossRevenue) * 100}%`, background: '#8b5cf6' }} title="AI Provider Spend">
            AI APIs
          </div>
          <div className="allocation-segment" style={{ width: `${allocation.stripeAndHosting}%`, background: '#64748b' }} title="Stripe & Cloud">
            Fees {allocation.stripeAndHosting}%
          </div>
        </div>

        <div className="allocation-legend">
          <div className="allocation-legend-item">
            <span className="allocation-legend-color" style={{ background: '#10b981' }} />
            <span><strong>Net Operating Profit ({estNetMarginPct.toFixed(1)}%):</strong> ${Math.round(estNetProfit).toLocaleString()}/mo</span>
          </div>
          <div className="allocation-legend-item">
            <span className="allocation-legend-color" style={{ background: '#3b82f6' }} />
            <span><strong>Payroll &amp; Staff ({allocation.payroll}%):</strong> ${Math.round(estPayrollBudget).toLocaleString()}/mo</span>
          </div>
          <div className="allocation-legend-item">
            <span className="allocation-legend-color" style={{ background: '#f59e0b' }} />
            <span><strong>Tax Provision ({allocation.taxReserve}%):</strong> ${Math.round(estTaxReserve).toLocaleString()}/mo</span>
          </div>
          <div className="allocation-legend-item">
            <span className="allocation-legend-color" style={{ background: '#8b5cf6' }} />
            <span><strong>AI APIs ({((estAiVendorCost / estMonthlyGrossRevenue) * 100).toFixed(1)}%):</strong> ${Math.round(estAiVendorCost).toLocaleString()}/mo</span>
          </div>
          <div className="allocation-legend-item">
            <span className="allocation-legend-color" style={{ background: '#64748b' }} />
            <span><strong>Stripe &amp; Hosting ({allocation.stripeAndHosting}%):</strong> ${Math.round(estStripeAndHosting).toLocaleString()}/mo</span>
          </div>
        </div>
      </div>

      {/* Subscription Plans & Token Matrix Table */}
      <section className="it-section">
        <h3 className="it-section-title">Subscription Tiers &amp; Unit Economics Matrix</h3>
        <p className="muted" style={{ marginTop: '-0.2rem', marginBottom: '0.85rem', fontSize: '0.84rem' }}>
          Configured live tiers showing monthly price, annual savings, token allocations, and safety gross margins.
        </p>

        <div className="ai-operations-scroll" role="region" aria-label="Subscription Matrix" tabIndex="0">
          <table className="plan-matrix-table">
            <thead>
              <tr>
                <th>Plan Tier</th>
                <th>Monthly Price</th>
                <th>Annual (15% off)</th>
                <th>Storage</th>
                <th>Monthly Tokens</th>
                <th>Est. API Cost</th>
                <th>Gross Margin</th>
                <th>Target Market Audience</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ORDER.map((key) => {
                const plan = PLANS[key]
                const estCostMin = (plan.includedAiCredits * 0.0018).toFixed(2)
                const estCostMax = (plan.includedAiCredits * 0.0035).toFixed(2)

                return (
                  <tr key={plan.key}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{plan.label}</strong>
                        {plan.popular && <span className="plan-badge">Popular</span>}
                      </div>
                    </td>
                    <td><strong style={{ fontSize: '1.05rem', color: '#1e293b' }}>${plan.monthlyPrice}</strong> <small style={{ color: '#64748b' }}>/ mo</small></td>
                    <td><strong style={{ color: '#2563eb' }}>${plan.annualPrice}</strong> <small style={{ color: '#64748b' }}>/ yr</small></td>
                    <td><strong>{plan.storageGb} GB</strong></td>
                    <td>
                      <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{plan.includedAiCredits.toLocaleString()}</strong>
                      <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>tokens / mo</span>
                    </td>
                    <td>
                      <span style={{ color: '#64748b', fontSize: '0.82rem' }}>${estCostMin} – ${estCostMax}</span>
                    </td>
                    <td>
                      <span className="plan-margin-pill">
                        {plan.marginPct}%
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: '#334155' }}>{plan.audience}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Vendor Price Change Simulator */}
      <section className="it-section">
        <h3 className="it-section-title">Scenario Modeling &amp; Vendor Price Simulator</h3>
        <p className="muted" style={{ marginTop: '-0.2rem', marginBottom: '0.85rem', fontSize: '0.84rem' }}>
          Simulate business outcomes if OpenAI/Runway prices increase or if customer volume scales.
        </p>

        <div className="pricing-sandbox-card">
          <div className="sandbox-controls-grid">
            <label>
              <strong>Active Paying Customers: {customUserCount.toLocaleString()}</strong>
              <input
                type="range"
                min="50"
                max="10000"
                step="50"
                value={customUserCount}
                onChange={(e) => setCustomUserCount(Number(e.target.value))}
              />
            </label>

            <label>
              <strong>Vendor Cost Shift (AI API Prices): {vendorCostAdjustment > 0 ? `+${vendorCostAdjustment}%` : `${vendorCostAdjustment}%`}</strong>
              <input
                type="range"
                min="-50"
                max="100"
                step="5"
                value={vendorCostAdjustment}
                onChange={(e) => setVendorCostAdjustment(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="sandbox-results-banner">
            <div>
              <span>Projected Annual Revenue</span>
              <strong>${Math.round(estAnnualGrossRevenue).toLocaleString()}</strong>
            </div>
            <div>
              <span>Annual Staff Payroll Pool</span>
              <strong style={{ color: '#2563eb' }}>${Math.round(estPayrollBudget * 12).toLocaleString()}</strong>
            </div>
            <div>
              <span>Annual Tax Provision</span>
              <strong style={{ color: '#d97706' }}>${Math.round(estTaxReserve * 12).toLocaleString()}</strong>
            </div>
            <div>
              <span>Annual Net Profit (Retained)</span>
              <strong style={{ color: estNetProfit >= 0 ? '#059669' : '#dc2626' }}>
                ${Math.round(estNetProfit * 12).toLocaleString()}
              </strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
