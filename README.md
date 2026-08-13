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
VITE_IMAGE_GEN_ENDPOINT=https://your-image-service.example.com/generate
VITE_IMAGE_GEN_API_KEY=your-image-service-key
VITE_IMAGE_GEN_MODEL=image-1
```

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
- Without env configuration, the app runs in demo mode for UI prototyping.

## Repost Migration Setup

1. Apply the migration in `supabase/migrations/20260716_repost_multitenant.sql` to your Supabase project.
2. Apply `supabase/migrations/20260716_repost_broadcast_rpc.sql` to enable admin broadcast queueing.
3. Apply `supabase/migrations/20260716_support_tickets.sql` to enable support ticket submission.
4. Ensure each authenticated user has a `profiles.company` value set. Tenant isolation for repost tables is enforced by this field.
5. Ensure admin users have `profiles.role = 'admin'` to manage company main posts and company social accounts.
6. Ensure users have `profiles.access_status = 'active'` if they should receive admin broadcast notifications.

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

- Add OAuth account linking for Meta, Snapchat, TikTok, and X.
- Add background job processing for scheduled publish events.
- Build a Supabase Edge Function named `generate-social-copy` for live AI text/image suggestions.
- Add a dedicated image-generation endpoint for the Photo Creator if you want real model-backed output.
- Add role-based access (user, manager, IT-admin) and audit logs.
