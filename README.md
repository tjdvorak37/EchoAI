# EchoAI

EchoAI is a JavaScript + Supabase social media scheduling platform built for teams who want to create multiple posts in one session and automatically deploy them throughout the day.

## Core Features Included

- User authentication with login, signup, password reset, and two-factor verification flow.
- Automatic account access request tickets on signup, requiring Management/IT approval before first login.
- User dashboard with connected social channels and campaign queue visibility.
- Company post syndication hub with notifications, approval board, copy/repost flow, and user-branded repost captions.
- Post scheduler with channel selection, message composition, image brief, and timed deployment queue.
- AI message studio for copy ideas, image prompts, and campaign suggestions.
- Immersive photo creator with AI image generation, brush tools, crop masking, and text effects.
- IT/Management oversight panel for incident tracking and operational visibility.
- Employee access lifecycle controls (approve, deny, deactivate, reactivate).
- Auto-approval toggle for non-technical users to repost company main-page posts automatically.
- Integration catalog section for 3rd party tool implementation planning.

## Tech Stack

- Frontend: React 19 + Vite
- Backend: Supabase (`@supabase/supabase-js`)
- Language: JavaScript (ES modules)

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Fill in your Supabase values in `.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Do not add provider credentials to `VITE_*` variables. Vite publishes every
`VITE_*` value to browsers. Configure image generation, listening connectors,
Stripe, cloud drives, and all OAuth secrets as Supabase Edge Function secrets
using `supabase/functions/.env.example` as the template.

4. Start development server:

```bash
npm run dev
```

## Supabase Integration Notes

- Authentication methods are in `src/services/authService.js`.
- Repost workflow service methods are in `src/services/repostService.js`.
- Post scheduling and AI hooks are in `src/services/platformService.js`.
- Photo Creator image generation is in `src/services/photoAiService.js` and falls back to a local canvas concept if no endpoint is configured.
- Supabase client bootstrap is in `src/lib/supabase.js`.
- Without Supabase configuration, the app runs in local demo mode for UI prototyping only.
   Never deploy that configuration for a beta.

## Repost Migration Setup

1. Apply `supabase/migrations/202607160002_repost_multitenant.sql` to your Supabase project.
2. Apply `supabase/migrations/202607160001_repost_broadcast_rpc.sql` to enable admin broadcast queueing.
3. Apply `supabase/migrations/202607160003_support_tickets.sql` to enable support ticket submission.
4. Ensure each authenticated user has a `profiles.company` value set. Tenant isolation for repost tables is enforced by this field.
5. Ensure admin users have `profiles.role = 'admin'` to manage company main posts and company social accounts.
6. Ensure users have `profiles.access_status = 'active'` if they should receive admin broadcast notifications.

## Security

**Two-factor authentication.** TOTP via `supabase.auth.mfa` — Google Authenticator, Authy,
1Password, or any TOTP app. Enrolment shows a QR code and issues ten single-use recovery codes
(stored bcrypt-hashed, never readable by the client).

Enforcement is at the database, not the UI. `app.mfa_satisfied()` compares the session's `aal`
claim against the user's enrolled factors, and RESTRICTIVE policies on `profiles`,
`subscriptions`, `user_ai_agent_config`, `billing_payments`, and `support_tickets` reject an
AAL1 session once a factor exists. `app.current_role()` returns `user` unless the session is
AAL2, so staff privileges require the second factor.

Lost devices are self-service: `mfa-recover` verifies password **and** an unused recovery code
server-side, then deletes the factor. A recovery code alone never mints a session.

**Secrets.** User-supplied AI agent API keys live in `user_ai_agent_config` with owner-only RLS.
They previously sat in `profiles.ai_agent_config`, which staff and company teammates can read.

**Deployment headers.** `amplify.yml` sets HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, and a
restrictive `Permissions-Policy`. Update `connect-src` if you add API endpoints. A static SPA
cannot set these itself — they must come from the host.

> **Client-side keys.** Anything named `VITE_*` is compiled into the JavaScript bundle and is
> readable by any visitor, so it can never hold a secret. The image generation and social
> listening providers are therefore proxied through the `ai-image` and `listening-fetch` edge
> functions, which require a signed-in user and read their keys from server-side secrets. Only
> `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain in the client, which is correct — the
> anon key is public by design and is constrained by RLS.
>
> Proxying also removed an SSRF path: the browser used to supply the connector URL, and now it
> can only name a source type.

## Plans

| Plan | Storage | Monthly | Annual (15% off) |
|---|---|---|---|
| Standard | 2 GB | $15 | $153 |
| Storage + | 10 GB | $18 | $184 |
| Storage Pro | 25 GB | $22 | $224 |
| Storage Max | 50 GB | $27 | $275 |
| Creator | 100 GB | $35 | $357 |

Tiers are defined once in [src/data/plans.js](src/data/plans.js) for the UI and in the
`plan_catalog` table for the server. Storage is enforced on upload: the subscribed tier sets
`profiles.storage_quota_mb`, and uploads past the limit are rejected.

A successful payment activates the account and applies the tier's storage immediately. A
downgrade lowers the quota on the next webhook, which can leave an account over its limit —
existing files are kept, but new uploads are blocked until usage is back under the cap.

## Automated Billing & Access Lifecycle

Access is derived from billing state by the database. Nobody approves, activates, or
deactivates an account by hand, so the system scales without operator involvement.

**How it works**

1. A buyer checks out through Stripe Checkout (`create-checkout-session` edge function).
   Prices live server-side, so the browser cannot alter the amount.
2. Stripe calls the `stripe-webhook` edge function. It verifies the signature, de-duplicates
   by event id in `billing_events`, and writes the result through `apply_stripe_subscription()`.
3. A trigger on `subscriptions` sets `profiles.access_status` to `active` while the
   subscription is entitled and `deactivated` the moment it is not.
4. Failed charges become `past_due` with a grace window (`BILLING_GRACE_DAYS`) while Stripe
   retries. When the window closes, access is gone.
5. `expire_overdue_subscriptions()` runs every 15 minutes via `pg_cron` as a safety net for
   any webhook that never arrived.
6. Signed-in sessions re-check `my_entitlement()` every 5 minutes and on window focus, so a
   lapse ends an active session rather than waiting for the next login.
7. Promo codes are validated and consumed atomically by `redeem_promo_code()`; the client
   never sees the code table.
8. Customers self-serve renewals, card updates, and cancellation through the `billing-portal`
   edge function, reachable from the Integrations tab.

Every paid or failed invoice is written to `billing_payments`, which is what the admin and
finance screens report on. Those screens read live billing data, so their license actions are
hidden outside demo mode.

Paying users skip the manual approval queue entirely: if a subscription already covers their
email, `claim_subscription_for_new_profile()` attaches it at signup and activates them.

**Setup**

1. Apply `supabase/migrations/20260812_core_identity.sql`, then
   `supabase/migrations/20260813_billing_automation.sql`. The first creates
   `profiles` and `access_requests` if they are missing and enables RLS on both —
   **apply it to staging first if your project currently runs them with RLS off.**
2. Create monthly and annual recurring prices in Stripe.
3. Set the function secrets listed in `supabase/functions/.env.example`:
   `supabase secrets set --env-file supabase/functions/.env`
4. Deploy the functions:
   `supabase functions deploy stripe-webhook create-checkout-session billing-portal`
5. Add a Stripe webhook endpoint pointing at the deployed `stripe-webhook` URL, subscribed to
   `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`, and
   `invoice.payment_failed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
6. If `pg_cron` is unavailable on your plan, call `public.expire_overdue_subscriptions()` from
   an external scheduler instead.

Without Supabase configured the app runs in demo mode, which simulates the same instant
activation locally.

## Referral Program

Any subscriber can open Integrations and generate a share link (`/?ref=CODE`).

- The referred customer gets **20% off their first month** or **10% off their first year**,
  applied as a `duration=once` Stripe coupon so it never carries into renewals.
- The referrer earns **one free month** per conversion, delivered as a Stripe customer balance
  credit against their next invoice. No money leaves the platform and there is nothing to pay out.
- Rewards are granted by the webhook the moment checkout completes, not on a schedule.

Abuse guards, all enforced server-side in `resolve_referral_code()`: no self-referral, no
discount for someone who already has an active subscription, and a unique index on the referred
email so one person can only ever generate one reward.

Apply `supabase/migrations/20260814_referrals.sql` and set `STRIPE_COUPON_REFERRAL_MONTHLY`
and `STRIPE_COUPON_REFERRAL_ANNUAL` to `duration=once` coupons you create in Stripe.

## Suggested Supabase Tables

- `profiles` (user metadata)
- `profiles` should include `role`, `access_status` (`pending`, `active`, `denied`, `deactivated`), and `email`.
- `access_requests` (`user_id`, `full_name`, `email`, `company`, `status`, `requested_at`, `reviewed_at`)
- `social_accounts` (connected channels and token health)
- `scheduled_posts` (campaign, message, channels, scheduled_at, status)
- `incident_reports` (title, owner, priority, status, created_at)

## Suggested Next Steps

## Operational Beta Checklist

Complete every item before allowing external beta users into the production
environment:

1. Apply every migration in `supabase/migrations` in version order, including
   `20260824_social_scheduler_privacy.sql`, `20260825_social_oauth_publishing.sql`,
   `20260826_ticket_attachments_bucket.sql`, `20260827_support_ticket_workflow.sql`,
   `202608280001_admin_user_audit.sql`, and `202608280002_public_support_tickets.sql`.
   Confirm Row Level Security is enabled
   for `scheduled_posts`, `user_social_accounts`, and `social_oauth_credentials`.
2. Set production function secrets from `supabase/functions/.env.example` using
   `supabase secrets set --env-file supabase/functions/.env`, then deploy every
   directory under `supabase/functions`. Set `APP_URL` to the canonical HTTPS
   production URL and configure the same URL in Supabase Auth redirect settings.
3. Configure Stripe live-mode products, prices, webhook signing secret, customer
   portal, and webhook events as described in Automated Billing & Access Lifecycle.
   Test checkout, cancellation, failed payment, and webhook replay using a
   non-production customer before opening beta access.
4. Register OAuth applications for every social network you intend to support.
   Each provider needs its own approved scopes, callback URL, client ID, client
   secret, token refresh implementation, and outbound publish API integration.
   A saved account handle is a private profile record, not authorization to post.
   Meta (Facebook Pages and Instagram Professional accounts) and YouTube have
   the first self-service connector implementation. Set `META_CLIENT_ID`,
   `META_CLIENT_SECRET`, `YOUTUBE_CLIENT_ID`, and `YOUTUBE_CLIENT_SECRET`, then
   deploy it with:

   ```bash
   supabase functions deploy social-oauth
   ```

   Register `https://<project-ref>.supabase.co/functions/v1/social-oauth` as the
   OAuth callback URL in each provider console.
5. Deploy a server-side scheduled publisher before advertising timed posting.
   It must claim only due rows for the authenticated owner, refresh tokens only
   from `social_oauth_credentials`, submit media to the selected provider, and
   record provider IDs, failures, and retry attempts. Never publish directly
   from the browser. Deploy the worker with:

   ```bash
   supabase functions deploy social-publisher
   ```

   Invoke it every minute from a trusted scheduler with
   `Authorization: Bearer <SOCIAL_PUBLISHER_CRON_SECRET>`. The worker currently
   publishes Facebook Page text posts and Instagram single-image posts. Other
   platforms remain blocked until their provider-specific publishing adapters
   are implemented and approved.
6. Configure the image generation and listening provider endpoints. Live mode
   intentionally reports provider failures or zero results instead of fabricating
   content. Verify each connector with an authenticated non-admin account.
7. Run an isolation test with two regular accounts: create posts, social profiles,
   media, cloud-drive connections, support tickets, and company data under each;
   then confirm neither account can query or alter the other account's personal
   records. Test staff views separately for their intended company-scoped access.
8. Rotate any credential that was ever copied into chat, logs, a repository, or
   an untrusted machine. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, Stripe secret
   keys, webhook secrets, client secrets, provider API keys, or user OAuth tokens
   in frontend environment variables.

The checked-in app is ready for authenticated, owner-scoped beta workflows after
these deployment prerequisites are completed. Direct social-network publishing is
blocked until the provider OAuth and server-side publisher in items 4-5 exist.
