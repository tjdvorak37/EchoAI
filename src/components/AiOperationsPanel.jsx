import { useState } from 'react'
import { supabase } from '../lib/supabase'

const emptyState = { products: [], pricing: [], providers: [], budget: null, financials: null }

export function AiOperationsPanel() {
  const [data, setData] = useState(emptyState)
  const [status, setStatus] = useState({ loading: false, saving: false, message: '', error: '' })

  const load = async () => {
    setStatus({ loading: true, saving: false, message: '', error: '' })
    try {
      const [products, pricing, providers, budget, financials] = await Promise.all([
        supabase.from('echo_credit_products').select('*').order('sort_order'),
        supabase.from('echo_ai_pricing').select('*').order('capability'),
        supabase.from('echo_provider_accounts').select('*').order('provider_key'),
        supabase.from('echo_ai_budget').select('*').eq('id', true).maybeSingle(),
        supabase.rpc('get_echo_ai_financial_summary'),
      ])
      const failed = [products, pricing, providers, budget].find((result) => result.error)
      if (failed) throw new Error(failed.error.message.includes('schema cache') ? 'Echo AI controls are not deployed yet. Apply Supabase migrations 202609130001 through 202609130005, then reload.' : failed.error.message)
      if (financials.error) throw new Error(financials.error.message)
      setData({ products: products.data || [], pricing: pricing.data || [], providers: providers.data || [], budget: budget.data, financials: financials.data?.[0] || null })
      setStatus({ loading: false, saving: false, message: 'AI operations loaded.', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, message: '', error: error.message })
    }
  }

  const updateRow = (group, id, field, value) => {
    setData((current) => ({ ...current, [group]: current[group].map((row) => row.id === id ? { ...row, [field]: value } : row) }))
  }

  const save = async () => {
    setStatus({ loading: false, saving: true, message: '', error: '' })
    try {
      for (const product of data.products) {
        const { error } = await supabase.from('echo_credit_products').update({ label: product.label, credits: Number(product.credits), price_usd: Number(product.price_usd), enabled: product.enabled }).eq('id', product.id)
        if (error) throw error
      }
      for (const price of data.pricing) {
        const { error } = await supabase.from('echo_ai_pricing').update({ bot_name: price.bot_name, bot_description: price.bot_description, echo_credit_cost: Number(price.echo_credit_cost ?? price.credit_cost), credit_cost: Number(price.echo_credit_cost ?? price.credit_cost), provider_cost_input: Number(price.provider_cost_input || 0), provider_cost_output: Number(price.provider_cost_output || 0), provider_cost_per_unit: Number(price.provider_cost_per_unit || 0), model: price.model, provider_key: price.provider_key, unit: price.unit, enabled: price.enabled }).eq('id', price.id)
        if (error) throw error
      }
      for (const provider of data.providers) {
        const { error } = await supabase.from('echo_provider_accounts').update({ label: provider.label, secret_name: provider.secret_name, endpoint: provider.endpoint, replacement_for: provider.replacement_for, priority: Number(provider.priority || 0), monthly_cap_usd: Number(provider.monthly_cap_usd), enabled: provider.enabled }).eq('id', provider.id)
        if (error) throw error
      }
      if (data.budget) {
        const { error } = await supabase.from('echo_ai_budget').update({ monthly_budget_usd: Number(data.budget.monthly_budget_usd), warning_usd: Number(data.budget.warning_usd), critical_usd: Number(data.budget.critical_usd), shutdown_usd: Number(data.budget.shutdown_usd), shutdown: data.budget.shutdown, shutdown_reason: data.budget.shutdown_reason }).eq('id', true)
        if (error) throw error
      }
      setStatus({ loading: false, saving: false, message: 'AI operations saved.', error: '' })
    } catch (error) {
      setStatus({ loading: false, saving: false, message: '', error: error.message })
    }
  }

  return (
    <div className="ai-operations-panel">
      <Section title="Echo AI operations">
        <p className="muted">Provider accounts and API secrets stay in Supabase Edge Function secrets. This panel manages routing, customer pricing, usage costs, and safety caps.</p>
        <div className="action-row">
          <button type="button" className="primary-button" onClick={load} disabled={status.loading}>{status.loading ? 'Loading...' : 'Load AI controls'}</button>
          <button type="button" className="ghost-button" onClick={save} disabled={status.saving || !data.budget}>{status.saving ? 'Saving...' : 'Save AI controls'}</button>
        </div>
        {status.message && <p className="auth-message">{status.message}</p>}
        {status.error && <p className="auth-message auth-error">{status.error}</p>}
      </Section>

      {data.products.length > 0 && <Section title="Customer credit packs">
        {data.products.map((product) => <div className="it-row" key={product.id}>
          <input value={product.label} onChange={(event) => updateRow('products', product.id, 'label', event.target.value)} />
          <label>Credits<input type="number" min="1" value={product.credits} onChange={(event) => updateRow('products', product.id, 'credits', event.target.value)} /></label>
          <label>Price USD<input type="number" min="0.01" step="0.01" value={product.price_usd} onChange={(event) => updateRow('products', product.id, 'price_usd', event.target.value)} /></label>
          <label><input type="checkbox" checked={product.enabled} onChange={(event) => updateRow('products', product.id, 'enabled', event.target.checked)} /> Enabled</label>
        </div>)}
      </Section>}

      {data.pricing.length > 0 && <Section title="AI generation pricing">
        <div className="ai-operations-scroll" role="region" aria-label="AI generation pricing controls" tabIndex="0">
        {data.pricing.map((price) => <div className="it-row ai-pricing-row" key={price.id}>
          <div><strong>{price.capability} / {price.mode}</strong><span>{price.unit} • route controller</span></div>
          <label>Bot name<input value={price.bot_name || ''} onChange={(event) => updateRow('pricing', price.id, 'bot_name', event.target.value)} /></label>
          <label>Description<input value={price.bot_description || ''} onChange={(event) => updateRow('pricing', price.id, 'bot_description', event.target.value)} /></label>
          <label>Echo Credits<input type="number" min="0" value={price.echo_credit_cost ?? price.credit_cost} onChange={(event) => updateRow('pricing', price.id, 'echo_credit_cost', event.target.value)} /></label>
          <label>Provider input/token<input type="number" min="0" step="0.000001" value={price.provider_cost_input || 0} onChange={(event) => updateRow('pricing', price.id, 'provider_cost_input', event.target.value)} /></label>
          <label>Provider output/token<input type="number" min="0" step="0.000001" value={price.provider_cost_output || 0} onChange={(event) => updateRow('pricing', price.id, 'provider_cost_output', event.target.value)} /></label>
          <label>Model<input value={price.model} onChange={(event) => updateRow('pricing', price.id, 'model', event.target.value)} /></label>
          <label>Provider<input value={price.provider_key} onChange={(event) => updateRow('pricing', price.id, 'provider_key', event.target.value)} /></label>
          <label><input type="checkbox" checked={price.enabled} onChange={(event) => updateRow('pricing', price.id, 'enabled', event.target.checked)} /> Enabled</label>
        </div>)}
        </div>
      </Section>}

      {data.providers.length > 0 && <Section title="Provider accounts and caps">
        <div className="ai-operations-scroll" role="region" aria-label="Provider account controls" tabIndex="0">
        {data.providers.map((provider) => <div className="it-row ai-provider-row" key={provider.id}>
          <div><strong>{provider.label}</strong><span>{provider.provider_key} • secret: {provider.secret_name}</span></div>
          <label>Endpoint<input value={provider.endpoint || ''} onChange={(event) => updateRow('providers', provider.id, 'endpoint', event.target.value)} /></label>
          <label>Replacement for<input value={provider.replacement_for || ''} onChange={(event) => updateRow('providers', provider.id, 'replacement_for', event.target.value)} placeholder="openai" /></label>
          <label>Monthly cap USD<input type="number" min="0" step="0.01" value={provider.monthly_cap_usd} onChange={(event) => updateRow('providers', provider.id, 'monthly_cap_usd', event.target.value)} /></label>
          <label><input type="checkbox" checked={provider.enabled} onChange={(event) => updateRow('providers', provider.id, 'enabled', event.target.checked)} /> Enabled</label>
        </div>)}
        </div>
      </Section>}

      {data.financials && <Section title="AI financials">
        <div className="fin-stat-grid">
          <div className="fin-stat"><span className="fin-stat-val">{data.financials.jobs}</span><span className="fin-stat-label">AI jobs</span></div>
          <div className="fin-stat"><span className="fin-stat-val">{data.financials.completed_jobs}</span><span className="fin-stat-label">Completed</span></div>
          <div className="fin-stat"><span className="fin-stat-val">{data.financials.credits_spent}</span><span className="fin-stat-label">Echo Credits spent</span></div>
          <div className="fin-stat"><span className="fin-stat-val">${Number(data.financials.provider_spend_usd || 0).toFixed(2)}</span><span className="fin-stat-label">Provider spend</span></div>
        </div>
      </Section>}

      {data.budget && <Section title="Global emergency spending firewall">
        <div className="inhouse-settings-grid">
          {['monthly_budget_usd', 'warning_usd', 'critical_usd', 'shutdown_usd'].map((field) => <label key={field}>{field.replaceAll('_', ' ')}<input type="number" min="0" step="0.01" value={data.budget[field]} onChange={(event) => setData((current) => ({ ...current, budget: { ...current.budget, [field]: event.target.value } }))} /></label>)}
        </div>
        <label className="toggle-row"><input type="checkbox" checked={data.budget.shutdown} onChange={(event) => setData((current) => ({ ...current, budget: { ...current.budget, shutdown: event.target.checked } }))} /> Pause paid AI generation globally</label>
      </Section>}
    </div>
  )
}

function Section({ title, children }) {
  return <section className="it-section"><h3 className="it-section-title">{title}</h3>{children}</section>
}
