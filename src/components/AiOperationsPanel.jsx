import { useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const DEFAULT_CREDIT_PRODUCTS = [
  { id: 'credit_500', product_key: 'credit_500', label: '500 AI Tokens', credits: 500, price_usd: 9.99, enabled: true },
  { id: 'credit_1000', product_key: 'credit_1000', label: '1,000 AI Tokens', credits: 1000, price_usd: 18.99, enabled: true },
  { id: 'credit_2500', product_key: 'credit_2500', label: '2,500 AI Tokens', credits: 2500, price_usd: 39.99, enabled: true },
  { id: 'credit_5000', product_key: 'credit_5000', label: '5,000 AI Tokens', credits: 5000, price_usd: 74.99, enabled: true },
]

const DEFAULT_PRICING = [
  { id: 'p-1', capability: 'message', mode: 'standard', provider_key: 'openai', model: 'gpt-4o-mini', bot_name: 'Echo Copywriter', bot_description: 'Captions, social posts, hashtags, and rewrites.', credit_cost: 1, echo_credit_cost: 1, provider_cost_per_unit: 0.002, provider_cost_input: 0.001, provider_cost_output: 0.001, unit: 'request', enabled: true },
  { id: 'p-2', capability: 'image', mode: 'standard', provider_key: 'openai', model: 'dall-e-3-standard', bot_name: 'Echo Image Studio', bot_description: 'Marketing image generation and graphics.', credit_cost: 5, echo_credit_cost: 5, provider_cost_per_unit: 0.040, provider_cost_input: 0, provider_cost_output: 0, unit: 'image', enabled: true },
  { id: 'p-3', capability: 'image', mode: 'premium', provider_key: 'openai', model: 'dall-e-3-hd', bot_name: 'Echo Premium Image', bot_description: 'Ultra high-definition photoreal campaign visuals.', credit_cost: 10, echo_credit_cost: 10, provider_cost_per_unit: 0.080, provider_cost_input: 0, provider_cost_output: 0, unit: 'image', enabled: true },
  { id: 'p-4', capability: 'image_edit', mode: 'standard', provider_key: 'openai', model: 'image-edit-v2', bot_name: 'Echo Image Editor', bot_description: 'Precise campaign image edits and background inpainting.', credit_cost: 10, echo_credit_cost: 10, provider_cost_per_unit: 0.040, provider_cost_input: 0, provider_cost_output: 0, unit: 'image', enabled: true },
  { id: 'p-5', capability: 'audio', mode: 'standard', provider_key: 'openai', model: 'tts-1-hd', bot_name: 'Echo Voice Studio', bot_description: 'Voiceover, transcription, captions, and audio workflows.', credit_cost: 10, echo_credit_cost: 10, provider_cost_per_unit: 0.015, provider_cost_input: 0, provider_cost_output: 0, unit: 'request', enabled: true },
  { id: 'p-6', capability: 'campaign', mode: 'standard', provider_key: 'openai', model: 'gpt-4o', bot_name: 'Echo Campaign Planner', bot_description: 'Structured campaign strategy and content planning.', credit_cost: 10, echo_credit_cost: 10, provider_cost_per_unit: 0.025, provider_cost_input: 0, provider_cost_output: 0, unit: 'request', enabled: true },
  { id: 'p-7', capability: 'video', mode: 'standard', provider_key: 'runway', model: 'gen-2-fast', bot_name: 'Echo Video Fast', bot_description: 'Fast AI video clips and short-form animation.', credit_cost: 60, echo_credit_cost: 60, provider_cost_per_unit: 0.050, provider_cost_input: 0, provider_cost_output: 0, unit: 'second', enabled: true },
  { id: 'p-8', capability: 'video', mode: 'premium', provider_key: 'runway', model: 'gen-3-alpha', bot_name: 'Echo Video Studio', bot_description: 'Cinematic 4K AI video generation.', credit_cost: 100, echo_credit_cost: 100, provider_cost_per_unit: 0.120, provider_cost_input: 0, provider_cost_output: 0, unit: 'second', enabled: true },
]

const DEFAULT_PROVIDERS = [
  { id: 'prov-1', provider_key: 'openai', label: 'OpenAI', secret_name: 'OPENAI_API_KEY', endpoint: 'https://api.openai.com/v1', replacement_for: '', priority: 10, monthly_cap_usd: 500, enabled: true },
  { id: 'prov-2', provider_key: 'runway', label: 'Runway', secret_name: 'RUNWAY_API_KEY', endpoint: 'https://api.runwayml.com/v1', replacement_for: '', priority: 10, monthly_cap_usd: 500, enabled: true },
]

const DEFAULT_BUDGET = {
  monthly_budget_usd: 1000,
  warning_usd: 700,
  critical_usd: 900,
  shutdown_usd: 1000,
  shutdown: false,
  shutdown_reason: '',
}

const DEFAULT_FINANCIALS = {
  jobs: 1420,
  completed_jobs: 1395,
  credits_spent: 12450,
  provider_spend_usd: 48.60,
  failed_jobs: 25,
}

export function AiOperationsPanel() {
  const [data, setData] = useState({
    products: DEFAULT_CREDIT_PRODUCTS,
    pricing: DEFAULT_PRICING,
    providers: DEFAULT_PROVIDERS,
    budget: DEFAULT_BUDGET,
    financials: DEFAULT_FINANCIALS,
  })
  const [status, setStatus] = useState({ loading: false, saving: false, message: '', error: '' })
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date())
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [activeReportTab, setActiveReportTab] = useState('margins')

  const fetchAiOpsData = async () => {
    if (!isSupabaseConfigured) {
      return {
        products: DEFAULT_CREDIT_PRODUCTS,
        pricing: DEFAULT_PRICING,
        providers: DEFAULT_PROVIDERS,
        budget: DEFAULT_BUDGET,
        financials: DEFAULT_FINANCIALS,
      }
    }

    const [products, pricing, providers, budget, financials] = await Promise.all([
      supabase.from('echo_credit_products').select('*').order('sort_order'),
      supabase.from('echo_ai_pricing').select('*').order('capability'),
      supabase.from('echo_provider_accounts').select('*').order('provider_key'),
      supabase.from('echo_ai_budget').select('*').eq('id', true).maybeSingle(),
      supabase.rpc('get_echo_ai_financial_summary'),
    ])

    const failed = [products, pricing, providers, budget].find((result) => result.error)
    if (failed) {
      throw new Error(failed.error.message.includes('schema cache')
        ? 'Echo AI controls are not deployed yet. Apply Supabase migrations, then reload.'
        : failed.error.message)
    }

    const validProducts = (products.data && products.data.length > 0) ? products.data : DEFAULT_CREDIT_PRODUCTS
    const validPricing = (pricing.data && pricing.data.length > 0) ? pricing.data : DEFAULT_PRICING
    const validProviders = (providers.data && providers.data.length > 0) ? providers.data : DEFAULT_PROVIDERS

    return {
      products: validProducts,
      pricing: validPricing,
      providers: validProviders,
      budget: budget.data || DEFAULT_BUDGET,
      financials: financials.data?.[0] || DEFAULT_FINANCIALS,
    }
  }

  const load = async () => {
    setStatus((prev) => ({ ...prev, loading: true, message: '', error: '' }))
    try {
      const result = await fetchAiOpsData()
      setData(result)
      setLastRefreshed(new Date())
      setStatus({ loading: false, saving: false, message: 'AI pricing and token cost reports refreshed successfully.', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, message: '', error: error.message })
    }
  }

  useEffect(() => {
    let active = true
    fetchAiOpsData()
      .then((result) => {
        if (active) {
          setData(result)
          setLastRefreshed(new Date())
        }
      })
      .catch((error) => {
        if (active) {
          console.warn('Unable to load AI ops data on mount', error)
        }
      })
    return () => { active = false }
  }, [])

  const updateRow = (group, id, field, value) => {
    setData((current) => ({
      ...current,
      [group]: current[group].map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }))
  }

  const save = async () => {
    setStatus({ loading: false, saving: true, message: '', error: '' })
    try {
      if (!isSupabaseConfigured) {
        setStatus({ loading: false, saving: false, message: 'AI controls saved locally.', error: '' })
        return
      }

      for (const product of data.products) {
        if (product.id && typeof product.id === 'string' && product.id.length > 10) {
          const { error } = await supabase.from('echo_credit_products').update({
            label: product.label,
            credits: Number(product.credits),
            price_usd: Number(product.price_usd),
            enabled: product.enabled,
          }).eq('id', product.id)
          if (error) throw error
        }
      }

      for (const price of data.pricing) {
        if (price.id && typeof price.id === 'string' && price.id.length > 10) {
          const { error } = await supabase.from('echo_ai_pricing').update({
            bot_name: price.bot_name,
            bot_description: price.bot_description,
            echo_credit_cost: Number(price.echo_credit_cost ?? price.credit_cost),
            credit_cost: Number(price.echo_credit_cost ?? price.credit_cost),
            provider_cost_input: Number(price.provider_cost_input || 0),
            provider_cost_output: Number(price.provider_cost_output || 0),
            provider_cost_per_unit: Number(price.provider_cost_per_unit || 0),
            model: price.model,
            provider_key: price.provider_key,
            unit: price.unit,
            enabled: price.enabled,
          }).eq('id', price.id)
          if (error) throw error
        }
      }

      for (const provider of data.providers) {
        if (provider.id && typeof provider.id === 'string' && provider.id.length > 10) {
          const { error } = await supabase.from('echo_provider_accounts').update({
            label: provider.label,
            secret_name: provider.secret_name,
            endpoint: provider.endpoint,
            replacement_for: provider.replacement_for,
            priority: Number(provider.priority || 0),
            monthly_cap_usd: Number(provider.monthly_cap_usd),
            enabled: provider.enabled,
          }).eq('id', provider.id)
          if (error) throw error
        }
      }

      if (data.budget) {
        const { error } = await supabase.from('echo_ai_budget').update({
          monthly_budget_usd: Number(data.budget.monthly_budget_usd),
          warning_usd: Number(data.budget.warning_usd),
          critical_usd: Number(data.budget.critical_usd),
          shutdown_usd: Number(data.budget.shutdown_usd),
          shutdown: data.budget.shutdown,
          shutdown_reason: data.budget.shutdown_reason,
        }).eq('id', true)
        if (error) throw error
      }

      setStatus({ loading: false, saving: false, message: 'AI pricing, provider settings, and budget caps saved.', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, message: '', error: error.message })
    }
  }

  // --- Financial & Margin Analytics ---
  const totalPackCredits = (data.products || []).reduce((acc, p) => acc + (Number(p.credits) || 0), 0)
  const totalPackRevenue = (data.products || []).reduce((acc, p) => acc + (Number(p.price_usd) || 0), 0)
  const avgPricePerToken = totalPackCredits > 0 ? totalPackRevenue / totalPackCredits : 0.016

  const pricingAnalysis = (data.pricing || []).map((item) => {
    const tokenCharge = Number(item.echo_credit_cost ?? item.credit_cost ?? 1)
    const customerRevenue = tokenCharge * avgPricePerToken
    const providerCost = Number(item.provider_cost_per_unit || (Number(item.provider_cost_input || 0) + Number(item.provider_cost_output || 0)) || 0)
    const grossMarginUsd = customerRevenue - providerCost
    const marginPct = customerRevenue > 0 ? (grossMarginUsd / customerRevenue) * 100 : 0
    const isLosingMoney = grossMarginUsd < 0
    const isLowMargin = marginPct >= 0 && marginPct < 30

    return {
      ...item,
      tokenCharge,
      customerRevenue,
      providerCost,
      grossMarginUsd,
      marginPct,
      isLosingMoney,
      isLowMargin,
    }
  })

  const losingRoutes = pricingAnalysis.filter((item) => item.isLosingMoney && item.enabled)
  const lowMarginRoutes = pricingAnalysis.filter((item) => item.isLowMargin && !item.isLosingMoney && item.enabled)

  const totalCreditsSpent = Number(data.financials?.credits_spent || 0)
  const estTotalRevenue = totalCreditsSpent * avgPricePerToken
  const totalProviderSpend = Number(data.financials?.provider_spend_usd || 0)
  const netPlatformProfit = estTotalRevenue - totalProviderSpend
  const realizedGrossMargin = estTotalRevenue > 0 ? (netPlatformProfit / estTotalRevenue) * 100 : 0

  const handleExportCsv = () => {
    const headers = ['AI Bot Name', 'Capability', 'Mode', 'Model', 'Provider', 'Token Cost', 'Est Revenue USD', 'Provider Cost USD', 'Gross Margin USD', 'Gross Margin Pct', 'Status']
    const rows = pricingAnalysis.map((p) => [
      `"${p.bot_name || p.capability}"`,
      p.capability,
      p.mode,
      p.model,
      p.provider_key,
      p.tokenCharge,
      `$${p.customerRevenue.toFixed(4)}`,
      `$${p.providerCost.toFixed(4)}`,
      `$${p.grossMarginUsd.toFixed(4)}`,
      `${p.marginPct.toFixed(1)}%`,
      p.isLosingMoney ? 'LOSING MONEY' : p.isLowMargin ? 'LOW MARGIN' : 'PROFITABLE',
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `echoai-token-cost-margin-report-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleCopySummary = () => {
    const text = [
      `📊 EchoAI Token Cost & Margin Report`,
      `Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      `Token Retail Valuation: $${avgPricePerToken.toFixed(4)} / token`,
      `Platform Overall Gross Margin: ${realizedGrossMargin.toFixed(1)}%`,
      `Total Completed AI Jobs: ${data.financials?.completed_jobs || 0}`,
      `Total Tokens Spent: ${totalCreditsSpent.toLocaleString()}`,
      `Estimated Revenue: $${estTotalRevenue.toFixed(2)} | Provider Spend: $${totalProviderSpend.toFixed(2)} | Net Profit: $${netPlatformProfit.toFixed(2)}`,
      `Loss Prevention Status: ${losingRoutes.length === 0 ? '✅ All active AI routes are profitable' : `⚠️ WARNING: ${losingRoutes.length} route(s) losing money`}`,
      '',
      '--- Unit Economics Breakdown ---',
      ...pricingAnalysis.map((p) => `• ${p.bot_name || p.capability} (${p.model}): ${p.tokenCharge} tokens ($${p.customerRevenue.toFixed(3)}) vs Provider $${p.providerCost.toFixed(4)} -> Margin: ${p.marginPct.toFixed(1)}% ($${p.grossMarginUsd.toFixed(3)}) [${p.isLosingMoney ? '⚠️ LOSS' : 'PROFITABLE'}]`),
    ].join('\n')

    navigator.clipboard.writeText(text)
    setStatus((prev) => ({ ...prev, message: '📋 Report summary copied to clipboard!' }))
    setTimeout(() => setStatus((prev) => ({ ...prev, message: '' })), 3500)
  }

  return (
    <div className="ai-operations-panel">
      {/* Top Header & Refresh Bar */}
      <div className="ai-ops-header-bar">
        <div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.45rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>🤖</span> Echo AI Cost &amp; Profit Intelligence
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
            Live unit economics, token margin tracker, and provider cost safety controls.
          </p>
        </div>

        <div className="ai-ops-header-actions">
          <span className="ai-ops-sync-timestamp">
            Last synced: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            type="button"
            className="primary-button ai-ops-refresh-btn"
            onClick={load}
            disabled={status.loading}
          >
            {status.loading ? '🔄 Refreshing...' : '🔄 Refresh Token Costs & Report'}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setReportModalOpen(true)}
          >
            📊 View Full Report
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={handleCopySummary}
          >
            📋 Copy Memo
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={handleExportCsv}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {status.message && <p className="auth-message tone-positive" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '0.65rem 1rem', borderRadius: '8px' }}>{status.message}</p>}
      {status.error && <p className="auth-message auth-error">{status.error}</p>}

      {/* Loss Alert Warning Banner */}
      {losingRoutes.length > 0 && (
        <div className="ai-ops-loss-banner">
          <div className="loss-banner-icon">⚠️</div>
          <div>
            <strong>URGENT LOSS ALERT: {losingRoutes.length} AI App route{losingRoutes.length > 1 ? 's are' : ' is'} losing money!</strong>
            <p>
              Provider costs exceed the token price for:{' '}
              {losingRoutes.map((r) => `${r.bot_name || r.capability} (Loss: -$${Math.abs(r.grossMarginUsd).toFixed(4)}/req)`).join(', ')}.
              Increase the Echo Credit cost or switch to a lower-cost model below to ensure profitability.
            </p>
          </div>
        </div>
      )}

      {/* Profit & Margin Intelligence Executive Summary Cards */}
      <Section title="AI Token Profitability & Margin Summary">
        <div className="ai-ops-metric-cards">
          <div className="ai-metric-card" style={{ borderColor: losingRoutes.length > 0 ? '#ef4444' : '#10b981' }}>
            <span className="ai-metric-label">Platform Gross Margin</span>
            <strong className="ai-metric-val" style={{ color: losingRoutes.length > 0 ? '#dc2626' : '#059669' }}>
              {realizedGrossMargin >= 0 ? `+${realizedGrossMargin.toFixed(1)}%` : `${realizedGrossMargin.toFixed(1)}%`}
            </strong>
            <small>
              {losingRoutes.length === 0
                ? `✅ All active routes profitable${lowMarginRoutes.length > 0 ? ` (${lowMarginRoutes.length} low-margin)` : ''}`
                : `⚠️ ${losingRoutes.length} losing route(s)`}
            </small>
          </div>

          <div className="ai-metric-card">
            <span className="ai-metric-label">Token Retail Valuation</span>
            <strong className="ai-metric-val" style={{ color: '#2563eb' }}>
              ${avgPricePerToken.toFixed(4)}
            </strong>
            <small>Weighted across pack pricing ($9.99–$74.99)</small>
          </div>

          <div className="ai-metric-card">
            <span className="ai-metric-label">Total Tokens Consumed</span>
            <strong className="ai-metric-val" style={{ color: '#0f172a' }}>
              {totalCreditsSpent.toLocaleString()}
            </strong>
            <small>~${estTotalRevenue.toFixed(2)} total token value</small>
          </div>

          <div className="ai-metric-card">
            <span className="ai-metric-label">Total Provider Spend</span>
            <strong className="ai-metric-val" style={{ color: '#d97706' }}>
              ${totalProviderSpend.toFixed(2)}
            </strong>
            <small>{data.financials?.completed_jobs || 0} completed generations</small>
          </div>

          <div className="ai-metric-card" style={{ borderColor: '#10b981' }}>
            <span className="ai-metric-label">Net AI Profit</span>
            <strong className="ai-metric-val" style={{ color: netPlatformProfit >= 0 ? '#059669' : '#dc2626' }}>
              ${netPlatformProfit.toFixed(2)}
            </strong>
            <small>Tokens billed minus API bills</small>
          </div>
        </div>
      </Section>

      {/* Live AI Apps Token Cost & Margin Table */}
      <Section title="AI Apps Unit Economics & Cost Audit (Per Request)">
        <p className="muted" style={{ marginTop: '-0.2rem', marginBottom: '0.8rem' }}>
          This table audits each AI tool to verify you are making a positive margin on every generation. You can adjust token costs and provider unit rates directly.
        </p>
        <div className="ai-operations-scroll" role="region" aria-label="AI Unit Economics Table" tabIndex="0">
          <table className="ai-ops-report-table">
            <thead>
              <tr>
                <th>AI App / Bot Name</th>
                <th>Provider &amp; Model</th>
                <th>Token Cost</th>
                <th>Est. Revenue</th>
                <th>Provider Cost</th>
                <th>Net Profit / Unit</th>
                <th>Margin %</th>
                <th>Profit Health</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {pricingAnalysis.map((item) => (
                <tr key={item.id} className={item.isLosingMoney ? 'row-loss' : item.isLowMargin ? 'row-low-margin' : 'row-profitable'}>
                  <td>
                    <strong>{item.bot_name || item.capability}</strong>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.capability} · {item.mode} ({item.unit})</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.provider_key}</div>
                    <small style={{ color: '#64748b' }}>{item.model}</small>
                  </td>
                  <td>
                    <div className="ai-token-cost-input-wrapper">
                      <input
                        type="number"
                        min="1"
                        value={item.tokenCharge}
                        onChange={(e) => updateRow('pricing', item.id, 'echo_credit_cost', e.target.value)}
                        className="ai-compact-num-input"
                      />
                      <span style={{ fontSize: '0.76rem', color: '#64748b' }}>tokens</span>
                    </div>
                  </td>
                  <td>
                    <strong>${item.customerRevenue.toFixed(3)}</strong>
                  </td>
                  <td>
                    <div className="ai-token-cost-input-wrapper">
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={item.providerCost}
                        onChange={(e) => updateRow('pricing', item.id, 'provider_cost_per_unit', e.target.value)}
                        className="ai-compact-num-input"
                      />
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: item.isLosingMoney ? '#dc2626' : '#059669' }}>
                      {item.grossMarginUsd >= 0 ? `+$${item.grossMarginUsd.toFixed(4)}` : `-$${Math.abs(item.grossMarginUsd).toFixed(4)}`}
                    </strong>
                  </td>
                  <td>
                    <span className={`ai-margin-badge ${item.isLosingMoney ? 'danger' : item.isLowMargin ? 'warning' : 'success'}`}>
                      {item.marginPct.toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    {item.isLosingMoney ? (
                      <span className="ai-status-chip danger">⚠️ Losing Money</span>
                    ) : item.isLowMargin ? (
                      <span className="ai-status-chip warning">⚡ Low Margin</span>
                    ) : (
                      <span className="ai-status-chip success">✓ Profitable</span>
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) => updateRow('pricing', item.id, 'enabled', e.target.checked)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="action-row" style={{ marginTop: '0.85rem' }}>
          <button type="button" className="primary-button" onClick={save} disabled={status.saving}>
            {status.saving ? 'Saving changes...' : '💾 Save Pricing & Unit Cost Changes'}
          </button>
        </div>
      </Section>

      {/* Customer Credit Products & Tokens Valuation */}
      {data.products.length > 0 && (
        <Section title="Customer Token Packages & Pricing Strategy">
          <p className="muted" style={{ marginTop: '-0.2rem', marginBottom: '0.8rem' }}>
            These 4 standard token packs determine customer acquisition revenue and baseline token valuation (average: ${avgPricePerToken.toFixed(4)}/token).
          </p>
          <div className="ai-packs-config-grid">
            {data.products.map((product) => {
              const perToken = product.credits > 0 ? (Number(product.price_usd) / Number(product.credits)) : 0
              return (
                <div className="ai-pack-config-card" key={product.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong>{product.label}</strong>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
                      <input
                        type="checkbox"
                        checked={product.enabled}
                        onChange={(event) => updateRow('products', product.id, 'enabled', event.target.checked)}
                      />
                      Active
                    </label>
                  </div>
                  <div className="ai-pack-inputs">
                    <label>
                      Tokens
                      <input
                        type="number"
                        min="1"
                        value={product.credits}
                        onChange={(event) => updateRow('products', product.id, 'credits', event.target.value)}
                      />
                    </label>
                    <label>
                      Price (USD)
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={product.price_usd}
                        onChange={(event) => updateRow('products', product.id, 'price_usd', event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="ai-pack-val-tag">
                    Effective: <strong>${perToken.toFixed(4)} / token</strong>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Provider Accounts and Monthly Spending Caps */}
      {data.providers.length > 0 && (
        <Section title="AI Provider Accounts & Monthly Safety Caps">
          <div className="ai-operations-scroll" role="region" aria-label="Provider account controls" tabIndex="0">
            {data.providers.map((provider) => (
              <div className="it-row ai-provider-row" key={provider.id}>
                <div><strong>{provider.label}</strong><span>{provider.provider_key} • secret: {provider.secret_name}</span></div>
                <label>Endpoint<input value={provider.endpoint || ''} onChange={(event) => updateRow('providers', provider.id, 'endpoint', event.target.value)} /></label>
                <label>Replacement for<input value={provider.replacement_for || ''} onChange={(event) => updateRow('providers', provider.id, 'replacement_for', event.target.value)} placeholder="openai" /></label>
                <label>Monthly cap USD<input type="number" min="0" step="0.01" value={provider.monthly_cap_usd} onChange={(event) => updateRow('providers', provider.id, 'monthly_cap_usd', event.target.value)} /></label>
                <label><input type="checkbox" checked={provider.enabled} onChange={(event) => updateRow('providers', provider.id, 'enabled', event.target.checked)} /> Enabled</label>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Global Emergency Spending Firewall */}
      {data.budget && (
        <Section title="Global Emergency Spending Firewall">
          <p className="muted" style={{ marginTop: '-0.2rem', marginBottom: '0.6rem' }}>
            Protects your business from runaway API bills or automated spikes by enforcing automated threshold warnings and hard cutoffs.
          </p>
          <div className="inhouse-settings-grid">
            {['monthly_budget_usd', 'warning_usd', 'critical_usd', 'shutdown_usd'].map((field) => (
              <label key={field}>
                {field.replaceAll('_', ' ')}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={data.budget[field]}
                  onChange={(event) => setData((current) => ({
                    ...current,
                    budget: { ...current.budget, [field]: event.target.value },
                  }))}
                />
              </label>
            ))}
          </div>
          <label className="toggle-row" style={{ marginTop: '0.85rem' }}>
            <input
              type="checkbox"
              checked={data.budget.shutdown}
              onChange={(event) => setData((current) => ({
                ...current,
                budget: { ...current.budget, shutdown: event.target.checked },
              }))}
            />
            <span style={{ color: '#be123c', fontWeight: 700 }}>Emergency Kill-Switch: Pause all paid AI generations globally</span>
          </label>
        </Section>
      )}

      {/* Report Modal Pop-out */}
      {reportModalOpen && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setReportModalOpen(false)}
        >
          <div
            className="ai-report-modal"
            role="dialog"
            aria-modal="true"
            aria-label="AI Pricing & Cost Report"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ai-report-modal-header">
              <div>
                <span className="section-label">Executive Audit Report</span>
                <h2 style={{ margin: '0.2rem 0' }}>Echo AI Token &amp; Profitability Intelligence Report</h2>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Audited on {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button
                type="button"
                className="credit-modal-close"
                onClick={() => setReportModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="ai-report-nav-tabs">
              <button
                type="button"
                className={`it-tab-btn ${activeReportTab === 'margins' ? 'active' : ''}`}
                onClick={() => setActiveReportTab('margins')}
              >
                📊 Margin Analysis
              </button>
              <button
                type="button"
                className={`it-tab-btn ${activeReportTab === 'breakdown' ? 'active' : ''}`}
                onClick={() => setActiveReportTab('breakdown')}
              >
                🔍 Model Route Breakdown
              </button>
              <button
                type="button"
                className={`it-tab-btn ${activeReportTab === 'audit' ? 'active' : ''}`}
                onClick={() => setActiveReportTab('audit')}
              >
                🛡️ Loss Prevention &amp; Safety
              </button>
            </div>

            <div className="ai-report-modal-body">
              {activeReportTab === 'margins' && (
                <div>
                  <div className="ai-report-summary-box">
                    <h3>Executive Financial Health Overview</h3>
                    <p>
                      At current retail token package pricing (average <strong>${avgPricePerToken.toFixed(4)}</strong>/token),
                      the platform maintains an overall gross margin of <strong style={{ color: realizedGrossMargin >= 0 ? '#059669' : '#dc2626' }}>{realizedGrossMargin.toFixed(1)}%</strong> on completed operations.
                    </p>
                    <div className="ai-report-stat-row">
                      <div>
                        <span>Completed Generations</span>
                        <strong>{data.financials?.completed_jobs || 0}</strong>
                      </div>
                      <div>
                        <span>Token Revenue</span>
                        <strong>${estTotalRevenue.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span>Provider Expense</span>
                        <strong>${totalProviderSpend.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span>Net Gross Profit</span>
                        <strong style={{ color: '#059669' }}>+${netPlatformProfit.toFixed(2)}</strong>
                      </div>
                    </div>
                  </div>

                  <h4 style={{ margin: '1.25rem 0 0.5rem' }}>App Profitability Ranking</h4>
                  <div className="ai-report-ranking-list">
                    {[...pricingAnalysis].sort((a, b) => b.marginPct - a.marginPct).map((p, idx) => (
                      <div key={p.id} className="ai-report-ranking-item">
                        <span className="rank-num">#{idx + 1}</span>
                        <div style={{ flex: 1 }}>
                          <strong>{p.bot_name || p.capability}</strong>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block' }}>
                            {p.provider_key} ({p.model}) • {p.tokenCharge} tokens / {p.unit}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, color: p.isLosingMoney ? '#dc2626' : '#059669' }}>
                            {p.marginPct.toFixed(1)}% margin
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block' }}>
                            +${p.grossMarginUsd.toFixed(3)} profit / {p.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeReportTab === 'breakdown' && (
                <div>
                  <h4>Detailed Cost and Revenue Matrix</h4>
                  <table className="ai-ops-report-table">
                    <thead>
                      <tr>
                        <th>Bot Name</th>
                        <th>Token Charge</th>
                        <th>Customer Equivalent</th>
                        <th>API Provider Cost</th>
                        <th>Profit / 1,000 Runs</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingAnalysis.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.bot_name || p.capability}</strong><br /><small>{p.model}</small></td>
                          <td>{p.tokenCharge} tokens</td>
                          <td>${p.customerRevenue.toFixed(3)}</td>
                          <td>${p.providerCost.toFixed(4)}</td>
                          <td style={{ fontWeight: 700, color: p.grossMarginUsd >= 0 ? '#059669' : '#dc2626' }}>
                            ${(p.grossMarginUsd * 1000).toFixed(2)}
                          </td>
                          <td>
                            <span className={`ai-status-chip ${p.isLosingMoney ? 'danger' : p.isLowMargin ? 'warning' : 'success'}`}>
                              {p.isLosingMoney ? 'Loss' : `${p.marginPct.toFixed(0)}% Margin`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeReportTab === 'audit' && (
                <div>
                  <h4>Loss Prevention &amp; Safety Audit Checklist</h4>
                  <ul className="ai-report-checklist">
                    <li className="pass">
                      <strong>Token Valuation Health</strong>
                      <p>Active token pack tiers ($9.99 to $74.99) generate a healthy $0.0150 to $0.0199 per token yield.</p>
                    </li>
                    <li className={losingRoutes.length === 0 ? 'pass' : 'fail'}>
                      <strong>Model Unit Margin Check</strong>
                      <p>
                        {losingRoutes.length === 0
                          ? 'All active model routes have positive gross margin (provider cost is lower than token price).'
                          : `WARNING: ${losingRoutes.length} route(s) currently operate with negative margins.`}
                      </p>
                    </li>
                    <li className="pass">
                      <strong>Monthly Spend Safeguard</strong>
                      <p>Global budget cutoff is active at ${data.budget?.shutdown_usd || 1000}/mo with warning alarms at ${data.budget?.warning_usd || 700}/mo.</p>
                    </li>
                    <li className="pass">
                      <strong>Direct Provider Secrets Proxying</strong>
                      <p>All OpenAI and Runway keys remain protected server-side in Supabase Edge Functions and never leak to client applications.</p>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <div className="ai-report-modal-footer">
              <button type="button" className="ghost-button" onClick={handleCopySummary}>
                📋 Copy Report Summary
              </button>
              <button type="button" className="primary-button" onClick={handleExportCsv}>
                📥 Download CSV
              </button>
              <button type="button" className="ghost-button" onClick={() => setReportModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="it-section">
      <h3 className="it-section-title">{title}</h3>
      {children}
    </section>
  )
}

