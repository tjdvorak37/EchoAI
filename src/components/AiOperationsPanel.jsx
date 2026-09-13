import { useState } from 'react'
import { supabase } from '../lib/supabase'

const emptyState = { products: [], pricing: [], providers: [], budget: null }

export function AiOperationsPanel() {
  const [data, setData] = useState(emptyState)
  const [status, setStatus] = useState({ loading: false, saving: false, message: '', error: '' })

  const load = async () => {
    setStatus({ loading: true, saving: false, message: '', error: '' })
    try {
      const [products, pricing, providers, budget] = await Promise.all([
        supabase.from('echo_credit_products').select('*').order('sort_order'),
        supabase.from('echo_ai_pricing').select('*').order('capability'),
        supabase.from('echo_provider_accounts').select('*').order('provider_key'),
        supabase.from('echo_ai_budget').select('*').eq('id', true).maybeSingle(),
      ])
      const failed = [products, pricing, providers, budget].find((result) => result.error)
      if (failed) throw new Error(failed.error.message)
      setData({ products: products.data || [], pricing: pricing.data || [], providers: providers.data || [], budget: budget.data })
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
        const { error } = await supabase.from('echo_ai_pricing').update({ credit_cost: Number(price.credit_cost), provider_cost_per_unit: Number(price.provider_cost_per_unit), model: price.model, provider_key: price.provider_key, enabled: price.enabled }).eq('id', price.id)
        if (error) throw error
      }
      for (const provider of data.providers) {
        const { error } = await supabase.from('echo_provider_accounts').update({ label: provider.label, secret_name: provider.secret_name, monthly_cap_usd: Number(provider.monthly_cap_usd), enabled: provider.enabled }).eq('id', provider.id)
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
    <div>
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
        {data.pricing.map((price) => <div className="it-row" key={price.id}>
          <div><strong>{price.capability} / {price.mode}</strong><span>{price.unit}</span></div>
          <label>Echo Credits<input type="number" min="0" value={price.credit_cost} onChange={(event) => updateRow('pricing', price.id, 'credit_cost', event.target.value)} /></label>
          <label>Provider cost<input type="number" min="0" step="0.000001" value={price.provider_cost_per_unit} onChange={(event) => updateRow('pricing', price.id, 'provider_cost_per_unit', event.target.value)} /></label>
          <label>Model<input value={price.model} onChange={(event) => updateRow('pricing', price.id, 'model', event.target.value)} /></label>
        </div>)}
      </Section>}

      {data.providers.length > 0 && <Section title="Provider accounts and caps">
        {data.providers.map((provider) => <div className="it-row" key={provider.id}>
          <div><strong>{provider.label}</strong><span>{provider.provider_key} • secret: {provider.secret_name}</span></div>
          <label>Monthly cap USD<input type="number" min="0" step="0.01" value={provider.monthly_cap_usd} onChange={(event) => updateRow('providers', provider.id, 'monthly_cap_usd', event.target.value)} /></label>
          <label><input type="checkbox" checked={provider.enabled} onChange={(event) => updateRow('providers', provider.id, 'enabled', event.target.checked)} /> Enabled</label>
        </div>)}
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
