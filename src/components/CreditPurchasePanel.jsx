import { useState, useEffect } from 'react'
import { billingService } from '../services/billingService'
import './CreditPurchasePanel.css'

export function CreditPurchasePanel({
  isModal = false,
  onClose,
  aiDashboard,
  onRefreshBalance,
}) {
  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [purchasingKey, setPurchasingKey] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    billingService.listCreditProducts()
      .then((items) => {
        if (active) {
          setProducts(items)
          setLoadingProducts(false)
        }
      })
      .catch((err) => {
        if (active) {
          console.warn('Could not load credit products', err)
          setLoadingProducts(false)
        }
      })
    return () => { active = false }
  }, [])

  const handleRefresh = async () => {
    if (refreshing || !onRefreshBalance) return
    setRefreshing(true)
    setError('')
    try {
      await onRefreshBalance()
      setMessage('Token balance synced.')
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setError(err.message || 'Unable to sync balance.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleBuyPack = async (productKey) => {
    setPurchasingKey(productKey)
    setError('')
    setMessage('')
    try {
      const result = await billingService.buyCreditPack(productKey)
      if (result?.demo) {
        // In demo mode, simulate adding credits and refreshing balance
        const pack = products.find((p) => p.product_key === productKey)
        const added = pack?.credits || 500
        setMessage(`🎉 Demo mode: Successfully added ${added.toLocaleString()} tokens to your balance!`)
        if (onRefreshBalance) await onRefreshBalance(added)
      }
    } catch (err) {
      setError(err.message || 'Unable to initialize checkout. Please try again.')
    } finally {
      setPurchasingKey('')
    }
  }

  const content = (
    <div className="credit-purchase-container">
      <div className="credit-purchase-header">
        <div>
          <p className="section-label">Echo AI Tokens & Add-ons</p>
          <h2>{isModal ? 'Purchase Additional Tokens' : 'AI Tokens & Add-on Store'}</h2>
          <p className="muted">
            Add extra tokens to your balance anytime for unlimited AI Copywriting, Image Studio creation, Video generation, and voice workflows.
          </p>
        </div>

        <div className="credit-balance-badge">
          <div className="credit-balance-info">
            <span className="credit-balance-label">Current Balance</span>
            <span className="credit-balance-num">
              {aiDashboard?.balance !== undefined ? aiDashboard.balance.toLocaleString() : '—'} <small style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6' }}>Tokens</small>
            </span>
          </div>
          {onRefreshBalance && (
            <button
              type="button"
              className="credit-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh available token balance"
            >
              {refreshing ? '🔄 Syncing...' : '🔄 Refresh'}
            </button>
          )}
        </div>
      </div>

      {message && <div className="auth-message tone-positive" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{message}</div>}
      {error && <div className="auth-message auth-error" style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{error}</div>}

      {loadingProducts ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
          Loading token packages...
        </div>
      ) : (
        <div className="credit-packs-grid">
          {products.map((pack) => {
            const isBuying = purchasingKey === pack.product_key
            const isPopular = pack.popular || pack.credits === 2500
            const isBestValue = pack.bestValue || pack.credits === 5000

            return (
              <div
                key={pack.product_key || pack.id}
                className={`credit-pack-card ${isPopular ? 'popular' : ''} ${isBestValue ? 'best-value' : ''}`}
              >
                {pack.badge && (
                  <span className={`pack-badge ${isBestValue ? 'best-value' : 'popular'}`}>
                    {pack.badge}
                  </span>
                )}

                <div className="pack-header">
                  <div className="pack-tag">{pack.tag || `${pack.credits} Pack`}</div>
                  <div className="pack-tokens">
                    {pack.credits.toLocaleString()}
                    <small>Tokens</small>
                  </div>
                  <div className="pack-price">
                    ${pack.price_usd ? pack.price_usd.toFixed(2) : '0.00'}
                    <span className="pack-price-period">one-time</span>
                  </div>
                </div>

                <ul className="pack-features">
                  {pack.features ? (
                    pack.features.map((feat, idx) => (
                      <li key={idx}>{feat}</li>
                    ))
                  ) : (
                    <>
                      <li>{pack.credits.toLocaleString()} Echo Credits</li>
                      <li>~{pack.credits.toLocaleString()} Copywriting prompts</li>
                      <li>~{Math.floor(pack.credits / 5).toLocaleString()} Image Studio designs</li>
                      <li>Never expires • Instant activation</li>
                    </>
                  )}
                </ul>

                <button
                  type="button"
                  className="pack-buy-btn"
                  onClick={() => handleBuyPack(pack.product_key)}
                  disabled={Boolean(purchasingKey)}
                >
                  {isBuying ? 'Redirecting to Stripe...' : `⚡ Purchase ${pack.credits.toLocaleString()} Tokens`}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="credit-security-banner">
        <div className="credit-security-info">
          <span style={{ fontSize: '1.25rem' }}>🔒</span>
          <div>
            <strong style={{ color: '#1e293b' }}>Secure 256-bit Stripe Checkout</strong>
            <div>Purchased tokens never expire and are credited immediately to your dashboard upon approved checkout.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <span style={{ background: '#e2e8f0', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>Visa / Mastercard</span>
          <span style={{ background: '#e2e8f0', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>American Express</span>
          <span style={{ background: '#e2e8f0', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>Apple / Google Pay</span>
        </div>
      </div>

      <div className="credit-usage-reference">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3>What can you create with tokens?</h3>
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Token costs per creative generation across all EchoAI tools:
            </p>
          </div>
        </div>

        <div className="credit-usage-grid">
          <div className="credit-usage-item">
            <div>
              <strong>Echo Copywriter</strong>
              <small>Captions, posts, scripts & hashtags</small>
            </div>
            <span className="credit-cost-tag">1 token / req</span>
          </div>

          <div className="credit-usage-item">
            <div>
              <strong>Echo Image Studio</strong>
              <small>Standard marketing visuals</small>
            </div>
            <span className="credit-cost-tag">5 tokens / img</span>
          </div>

          <div className="credit-usage-item">
            <div>
              <strong>Echo Premium Image</strong>
              <small>Photoreal 4K campaign creative</small>
            </div>
            <span className="credit-cost-tag">10 tokens / img</span>
          </div>

          <div className="credit-usage-item">
            <div>
              <strong>Echo Image Editor</strong>
              <small>Precise background edits & inpainting</small>
            </div>
            <span className="credit-cost-tag">10 tokens / img</span>
          </div>

          <div className="credit-usage-item">
            <div>
              <strong>Echo Voice Studio</strong>
              <small>Voiceover, audio captions & speech</small>
            </div>
            <span className="credit-cost-tag">10 tokens / req</span>
          </div>

          <div className="credit-usage-item">
            <div>
              <strong>Echo Video Studio</strong>
              <small>AI-generated video animations</small>
            </div>
            <span className="credit-cost-tag">60 tokens / sec</span>
          </div>
        </div>
      </div>
    </div>
  )

  if (isModal) {
    return (
      <div
        className="credit-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) onClose()
        }}
      >
        <div className="credit-modal-dialog" role="dialog" aria-modal="true">
          <button
            type="button"
            className="credit-modal-close"
            onClick={onClose}
            aria-label="Close token purchase window"
          >
            ✕
          </button>
          {content}
        </div>
      </div>
    )
  }

  return <section className="panel">{content}</section>
}
