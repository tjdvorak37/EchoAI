# EchoAI

EchoAI is a React and Supabase workspace for creating, scheduling, publishing,
and analyzing social content. It combines campaign planning, media creation,
social connections, support workflows, analytics, and team controls in one web
application.

## Current Product

- Dashboard for workspace activity, connected accounts, announcements, and
  account status.
- Create Desk for campaign copy, briefs, personas, and hosted AI workflows.
- Image Lab and Motion Lab for image and video editing and export.
- Queue Studio for scheduling posts and managing publishing work.
- Signal Watch for social listening and external-source monitoring.
- Broadcast Hub for company post distribution and repost workflows.
- Connections for social accounts, cloud drives, AI providers, and billing.
- Brand kits for company colors, fonts, logos, and creative defaults.
- Analytics, advertising, finance, board, and administrative workspaces for
  authorized staff.
- Help Center, support tickets, inbound customer email replies, and ticket
  notifications.

## Social Platforms

Publishing adapters currently available:

- Facebook Pages
- Instagram Professional accounts
- TikTok
- YouTube
- X
- LinkedIn

The catalog also includes Threads, Twitch, Google Business Profile, Bluesky,
and Pinterest as planned destinations. Availability still depends on each
provider's OAuth approval, scopes, account type, and API permissions.

## Account Plans

EchoAI currently has a permanent free Standard account and one paid Premium
tier. The canonical plan definition is [src/data/plans.js](src/data/plans.js).

| Account | Price | Access |
|---|---:|---|
| Standard | Free | Permanent account, workspace discovery, account setup, connections, help, and limited posting allowance |
| Premium | $39/month or $390/year | Paid creation, publishing, monitoring, advertising, and full workspace tools |

Standard accounts receive ten free posting uses. Staff roles receive internal
entitlement for platform operations. The server-side entitlement and access
rules remain authoritative over the frontend labels.

AI token packages and Stripe price IDs are configured as Edge Function secrets;
do not copy old storage-tier pricing into new documentation or configuration.

## Technology

- Frontend: React 19, Vite, JavaScript ES modules
- Backend: Supabase Auth, Postgres, Row Level Security, Storage, and Edge Functions
- Payments: Stripe Checkout, webhooks, and customer billing portal
- Icons: lucide-react
- Media/document tooling: browser canvas, MediaRecorder, PDF.js, and JSZip
- Hosting: AWS Amplify-compatible static deployment

## Local Development

### Requirements

- Node.js 20 or later
- npm
- A Supabase project for live data; without Supabase variables the app runs in
  local demo mode only

### Install and run

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run lint
npm run build
npm run preview
```

The production checks currently pass with `npm run lint` and `npm run build`.

### Frontend environment

Create a local `.env` with only the public Supabase client values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The Supabase anon key is public by design and is constrained by database RLS.
Never place Stripe secrets, provider API keys, OAuth client secrets, webhook
secrets, or the Supabase service-role key in a `VITE_*` variable. Vite publishes
all `VITE_*` values to the browser.

Edge Function secrets are documented in
[supabase/functions/.env.example](supabase/functions/.env.example). Keep real
values in the Supabase secret manager or a local ignored `.env` file; never
commit them.

## Supabase and Deployment

The production Supabase configuration is in [supabase/config.toml](supabase/config.toml).
It defines the production Auth URL and redirect allowlist, email confirmation,
TOTP MFA, and the JWT behavior for public webhook, OAuth, recovery, and
authenticated functions.

Apply migrations in filename order with the Supabase CLI, then deploy the Edge
Functions required by the environment:

```bash
supabase db push
supabase functions deploy <function-name>
```

CI deploys the frontend build but does not automatically deploy Supabase
migrations or Edge Functions. Production backend changes therefore require an
explicit `supabase db push` and function deployment using an appropriately
scoped Supabase access token.

The Amplify deployment in [amplify.yml](amplify.yml) builds `dist`, serves SPA
deep links through `index.html`, and supplies HSTS, CSP, clickjacking,
MIME-sniffing, referrer, and permissions policies.

## Security

EchoAI's detailed control summary is in
[Security Compliance Overview](docs/SECURITY_COMPLIANCE_OVERVIEW.md). The main
controls are:

- Supabase Auth with email confirmation, password recovery, and TOTP MFA.
- Database-enforced MFA assurance and role checks, not UI-only protection.
- Row Level Security for user, company, billing, support, social, and workspace
  data.
- Owner-only storage of user AI agent credentials.
- Server-side Edge Function proxying for provider secrets and privileged calls.
- Private support attachments with MIME/size limits and short-lived signed URLs.
- Signed and de-duplicated Stripe webhooks.
- Validated, rate-limited public support intake and authenticated support replies.
- CI secret scanning, linting, and production build verification.

For a pre-production audit, use the architecture-specific [Security & Compliance
Checklist](docs/SECURITY_COMPLIANCE_CHECKLIST.md). It contains 78 controls with
inspection locations, PASS/FAIL criteria, risk levels, and evidence guidance.

This repository does not by itself constitute SOC 2, ISO 27001, GDPR, HIPAA,
or another formal certification. Production owners must separately verify
access reviews, secret rotation, backups and restore tests, monitoring, audit
retention, incident response, vendor agreements, and data retention/deletion
procedures.

## Authentication and Access Lifecycle

- New users confirm their email before normal account use.
- Free accounts remain available after paid entitlement ends; billing controls
  paid features rather than deleting or deactivating the account.
- Explicitly denied or deactivated profiles remain blocked.
- Staff roles receive internal entitlement according to server-side role rules.
- Sessions periodically re-check entitlement so paid access changes take effect
  without waiting for a new login.
- MFA recovery requires the account password and an unused recovery code.

## Billing

1. The client requests checkout; the server selects the Stripe price.
2. Stripe sends a signed event to `stripe-webhook`.
3. The webhook de-duplicates events and updates subscription state through
   privileged database functions.
4. Database triggers and entitlement functions update paid access.
5. Scheduled expiry checks provide a safety net if a webhook is delayed.
6. Customers manage payment methods, renewals, and cancellation through
   `billing-portal`.

Referral links use `/?ref=CODE`. A referred customer can receive a one-time
20% first-month or 10% first-year discount, and the referrer can receive a
Stripe customer-balance credit. Attribution and reward logic run server-side.

## Support and Customer Email

Public support intake is handled by `public-support-ticket`. Signed-in replies
use `support-ticket-reply`. Microsoft 365 customer replies can be ingested
through Power Automate using a hashed inbound webhook secret, sender validation,
ticket matching, and provider-message deduplication.

See [Microsoft 365 Support Reply Ingestion](docs/MICROSOFT_365_SUPPORT_INBOUND.md)
for the mailbox and Power Automate setup.

## In-house AI

EchoAI owns user context, personas, references, editable projects, routing, and
workspace delivery. Model execution is behind the in-house AI contract and can
support message, document, image, image editing, character, video, audio,
vision, and moderation capabilities.

See [EchoAI In-house Agent Contract](docs/INHOUSE_AI_AGENT.md) for request and
response shapes, routing guidance, safety expectations, and future async job
support.

## Repository Layout

```text
src/
  App.jsx                 Application shell and authenticated workspace
  components/             Product panels and editors
  data/                   Plans, social catalog, help content, demo data
  services/               Auth, billing, publishing, analytics, and data APIs
  lib/supabase.js         Supabase browser client
supabase/
  migrations/             Database schema, RLS, functions, and data controls
  functions/              Server-side integrations and privileged operations
  config.toml             Production Auth and Edge Function configuration
docs/                     Operational contracts and compliance documentation
```

## Release Checklist

Before enabling a production workflow:

1. Apply all migrations to staging, then production, and verify the deployed
   migration history.
2. Set Edge Function secrets through Supabase and deploy the required functions.
3. Configure production Auth redirects and email confirmation.
4. Configure Stripe products, prices, webhook signing, and customer portal.
5. Register only the social OAuth applications and scopes that have been
   approved by each provider.
6. Run cross-company isolation tests with two ordinary accounts and staff roles.
7. Test failed payments, subscription expiry, password recovery, MFA recovery,
   support intake, inbound email, and webhook replay.
8. Confirm backups, monitoring, access reviews, retention, and incident-response
   ownership before inviting external users.
