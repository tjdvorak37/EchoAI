# EchoAI Security Compliance Overview

**Purpose:** A plain-language overview of the security controls implemented in
EchoAI. This document is intended for customer conversations, internal reviews,
vendor questionnaires, and security due diligence.

**Review date:** 2026-09-20

## Executive Summary

EchoAI uses defense-in-depth security controls across identity, application
authorization, database access, secret management, integrations, and deployment
configuration. The most important boundary is enforced on the server and in the
database, not only in the browser interface.

EchoAI is not claiming a SOC 2, ISO 27001, GDPR, HIPAA, or other formal
certification based on this document alone. Formal compliance also requires
organizational policies, evidence, contracts, operational procedures, and in
some cases an independent audit.

## Controls In Place

### 1. Authentication and account security

**What is in place**

- Supabase Auth manages user identity and sessions.
- Email confirmation is enabled for production accounts.
- Password recovery uses controlled recovery routes and single-use setup links
  for administrative invitations and recovery actions.
- TOTP multi-factor authentication is supported through Supabase Auth MFA.
- MFA recovery requires both the account password and an unused recovery code.

**Definition**

Authentication verifies who a user is. MFA adds a second proof, such as a code
from an authenticator app, so a stolen password alone is insufficient.

**Important implementation detail**

MFA is enforced by database policies using the session assurance level (AAL),
not just by showing an extra screen in the UI. Recovery codes are stored as
bcrypt hashes and are not readable by the client.

### 2. Authorization and least privilege

**What is in place**

- Database Row Level Security (RLS) controls access to user and company data.
- Company-scoped records use the authenticated user's company identity.
- Owner-only records, including user AI agent configuration, are protected by
  owner-specific policies.
- Administrative and finance capabilities are restricted by role and, where
  applicable, MFA assurance.
- Privileged database functions are granted to the service role instead of to
  anonymous users or ordinary authenticated users.

**Definition**

Authorization determines what an authenticated person or service is allowed to
read or change. Least privilege means granting only the access required for a
specific task.

**Why it matters**

The browser can request data, but it cannot grant itself access. The database
policies remain the enforcement point even if a user modifies the frontend or
directly calls the API.

### 3. Tenant and customer-data isolation

**What is in place**

- RLS is enabled across the core identity, billing, support, scheduling,
  social, finance, and workspace data surfaces.
- Users can read their own records; company and staff access is explicitly
  scoped by role and company rules.
- Billing events and other backend-only records have no normal client read
  policy.
- Support-ticket attachments are stored in a private bucket, namespaced by
  user ID, and accessed through short-lived signed URLs.

**Definition**

Tenant isolation prevents one customer, company, or user from accessing another
customer's records. RLS applies that boundary at the database row level.

### 4. Secret and credential management

**What is in place**

- Provider secrets are read by Supabase Edge Functions from server-side
  environment variables.
- Secret values are not placed in `VITE_*` variables or shipped in the browser
  bundle.
- AI agent credentials are stored separately in an owner-only table rather
  than in broadly readable profile data.
- OAuth, Stripe, email, cloud-drive, and AI provider credentials are handled by
  backend functions.
- CI checks for common provider-key and service-role-key patterns in client
  source.

**Definition**

Anything beginning with `VITE_` is public after a Vite build. A secret is safe
only when it stays on a trusted server boundary and is never returned to an
untrusted browser.

### 5. Secure integrations and API boundaries

**What is in place**

- Sensitive provider calls are proxied through authenticated Edge Functions.
- Edge functions validate the caller before performing privileged work.
- Stripe webhook signatures are verified and event IDs are de-duplicated.
- Support inbound webhooks require a configured secret, validate sender and
  ticket matching, and de-duplicate provider message IDs.
- CORS responses allow only the configured production origins.
- OAuth state and callback flows are handled server-side.

**Definition**

An API boundary is a controlled point where requests are authenticated,
validated, authorized, and recorded before reaching a provider or database.

### 6. Browser and deployment protections

**What is in place**

- HTTPS is required through HSTS with subdomain coverage.
- Content Security Policy restricts scripts, frames, connections, and object
  content.
- `X-Frame-Options: DENY` and `frame-ancestors 'none'` reduce clickjacking
  risk.
- `X-Content-Type-Options: nosniff` prevents MIME-type sniffing.
- Referrer-Policy limits referrer data sent to other origins.
- Permissions-Policy restricts unnecessary browser capabilities.
- Production builds run linting, compilation, and client-secret checks in CI.

**Definition**

Security headers tell browsers which capabilities and content sources are
allowed. They reduce the impact of common browser attacks such as clickjacking,
content injection, and accidental cross-origin data leakage.

### 7. Billing and access lifecycle controls

**What is in place**

- Checkout prices are selected server-side rather than trusted from the
  browser.
- Stripe webhooks update subscription state through privileged database
  functions.
- Access changes are derived from subscription state and entitlement checks.
- Overdue subscriptions are swept on a schedule as a webhook safety net.
- Promo-code redemption is validated and consumed atomically.

**Definition**

An automated access lifecycle reduces manual privilege errors by deriving
account access from verified billing events and current entitlement state.

### 8. Input, file, and notification safeguards

**What is in place**

- Attachment buckets restrict file size and MIME types.
- Signed URLs limit private attachment access and expire after a short period.
- Support notification settings are stored separately from message content and
  are subject to access checks.
- AI and media workflows use server-side provider routing rather than exposing
  provider credentials to users.

## Evidence and Reference Locations

The following repository locations contain implementation evidence:

- [Project security notes](../README.md#security)
- [Production auth configuration](../supabase/config.toml)
- [Deployment security headers](../amplify.yml)
- [CI checks](../.github/workflows/ci.yml)
- [Core identity and RLS migration](../supabase/migrations/20260812_core_identity.sql)
- [MFA and secret hardening migration](../supabase/migrations/20260816_mfa_and_secret_hardening.sql)
- [Private ticket attachment policy](../supabase/migrations/20260826_ticket_attachments_bucket.sql)
- [Billing automation and entitlement controls](../supabase/migrations/20260813_billing_automation.sql)
- [Inbound support webhook validation](../supabase/functions/support-ticket-inbound/index.ts)
- [Microsoft 365 inbound support procedure](./MICROSOFT_365_SUPPORT_INBOUND.md)

## Current Verification Status

The repository checks completed for this overview were:

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities reported.
- Tracked-source secret scan: no real credentials found.

## Operational Responsibilities

Code controls are only one part of a complete compliance program. Production
owners must also verify and retain evidence for:

- Supabase migrations and Edge Functions deployed at the intended production
  version.
- Production secrets stored in the provider secret manager, with a rotation
  schedule and revocation procedure.
- Database backups, point-in-time recovery, restore testing, and retention.
- Access reviews for administrators, technicians, finance users, and service
  accounts.
- Security incident response, breach notification, and contact ownership.
- Data retention and deletion procedures, including customer requests.
- Vendor agreements, subprocessors, data-region requirements, and privacy
  notices.
- Monitoring, alerting, audit-log retention, and periodic vulnerability scans.

## Suggested Response to Security Questions

> EchoAI uses Supabase Auth with TOTP MFA, database-enforced Row Level Security,
> company and owner-scoped authorization, private storage with signed URLs, and
> server-side Edge Functions for provider secrets and privileged operations. The
> deployment adds HSTS, CSP, clickjacking protection, MIME sniffing protection,
> and restrictive browser permissions. CI checks the production build and scans
> for secrets in client code. We separately verify production deployment,
> secret rotation, backups, monitoring, access reviews, and privacy operations;
> this overview is not a claim of formal SOC 2, ISO, HIPAA, or GDPR
> certification.
