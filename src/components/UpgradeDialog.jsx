import { Check, LockKeyhole, X } from 'lucide-react'
import { PLAN_ORDER, PLANS } from '../data/plans'
import './UpgradeDialog.css'

export function UpgradeDialog({ feature, loadingPlan, error, onChoosePlan, onClose }) {
  return (
    <div className="upgrade-backdrop" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <section className="upgrade-dialog">
        <header className="upgrade-header">
          <div className="upgrade-icon"><LockKeyhole size={21} /></div>
          <div>
            <span>Premium feature</span>
            <h2 id="upgrade-title">Unlock {feature}</h2>
          </div>
          <button type="button" className="upgrade-close" onClick={onClose} aria-label="Close upgrade options"><X size={20} /></button>
        </header>

        <p className="upgrade-intro">Your Standard account stays active. Choose a Premium plan when you are ready to use this tool.</p>

        <div className="upgrade-plans">
          {PLAN_ORDER.map((planKey) => {
            const plan = PLANS[planKey]
            return (
              <article className={plan.popular ? 'upgrade-plan is-popular' : 'upgrade-plan'} key={plan.key}>
                <div><strong>{plan.label}</strong>{plan.popular && <span>Popular</span>}</div>
                <p><b>${plan.monthlyPrice}</b> / month</p>
                <small><Check size={13} /> Full access to publishing, creation, monitoring, and Ads</small>
                <button type="button" onClick={() => onChoosePlan(plan.key)} disabled={Boolean(loadingPlan)}>
                  {loadingPlan === plan.key ? 'Opening checkout...' : `Choose ${plan.label}`}
                </button>
              </article>
            )
          })}
        </div>

        {error && <p className="upgrade-error">{error}</p>}
        <p className="upgrade-footnote">Cancel anytime and return to Standard access without losing your account.</p>
      </section>
    </div>
  )
}