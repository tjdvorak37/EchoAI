# EchoAI Security & Compliance Checklist

**Scope:** EchoAI React/Vite frontend, Supabase Auth/Postgres/Storage/Edge Functions,
AWS Amplify hosting, AI providers, social OAuth/publishing, Stripe billing, and
support operations.

**Purpose:** A production-readiness audit sheet based on the current EchoAI
architecture. Mark each control `PASS`, `FAIL`, or `N/A`, record the reviewer and
date, and attach the evidence identified in the final column.

## How to Use

- `PASS` means the stated condition is demonstrably true in the target environment.
- `FAIL` means the condition is absent, broken, or cannot be evidenced.
- `N/A` is allowed only with a written justification.
- Validate staging first, then repeat production checks after deployment.
- Do not paste secrets, tokens, customer content, or recovery codes into evidence.

Risk levels: **Critical**, **High**, **Medium**, **Low**.

## 1. Application

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| APP-01 | Confirm the deployed commit matches the reviewed source. | AWS Amplify deployment and Git history | Production artifact identifies the approved commit. | High | Deployment ID and commit SHA |
| APP-02 | Run the production build from a clean install. | `npm ci && npm run build` | Build completes without errors. | Medium | CI run URL and build log |
| APP-03 | Run lint and review new warnings. | `npm run lint` | Lint completes with no unexplained warnings/errors. | Low | CI run URL |
| APP-04 | Verify demo mode cannot be used as production mode. | `src/lib/supabase.js`, deployed environment | Production has both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. | High | Redacted environment checklist |
| APP-05 | Confirm client code contains no provider secrets. | Built assets and CI secret scan | No Stripe secret, service-role key, OAuth secret, or provider API key appears. | Critical | Scan output and artifact hash |
| APP-06 | Test authorization by modifying frontend requests and direct API calls. | Browser devtools and Supabase API | Unauthorized reads/writes fail at the backend. | Critical | Test cases and redacted responses |

## 2. Supabase Database

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| DB-01 | Apply migrations in order and verify migration history. | Supabase migration history | Production matches the reviewed migration set. | Critical | Migration history export |
| DB-02 | Confirm RLS is enabled on every customer-data table. | Supabase SQL editor/catalog | All application tables have RLS enabled. | Critical | RLS inventory query output |
| DB-03 | Review every policy for company/owner scope. | `supabase/migrations/` and live policies | No policy permits unintended cross-user or cross-company access. | Critical | Policy export and review notes |
| DB-04 | Review `SECURITY DEFINER` functions. | SQL migrations and catalog | Each has a fixed `search_path`, caller check, and least-privilege grant. | Critical | Function definitions and grants |
| DB-05 | Revoke default public execution on privileged functions. | `information_schema.routine_privileges` | Only intended roles can execute privileged routines. | High | Grant/revoke query output |
| DB-06 | Test tenant isolation with two ordinary users and two companies. | Staging Supabase project | User A cannot query, update, delete, or infer User B's private records. | Critical | Test script and result log |

## 3. AWS / Amplify Hosting

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| AWS-01 | Confirm the production domain uses HTTPS only. | Amplify domain settings and browser | HTTP redirects to HTTPS and no mixed content is loaded. | High | Header capture and screenshot |
| AWS-02 | Verify HSTS is present and includes subdomains. | `curl -I https://www.echoaipro.com` | `Strict-Transport-Security` is present with the approved policy. | High | Redacted header output |
| AWS-03 | Verify CSP matches actual required origins. | `amplify.yml` and response headers | CSP is present, intentional, and blocks unapproved script/connect/frame sources. | High | Header capture and CSP review |
| AWS-04 | Verify clickjacking protections. | Response headers | `X-Frame-Options: DENY` and equivalent frame ancestor policy are present. | Medium | Header capture |
| AWS-05 | Review AWS IAM and deployment identities. | AWS IAM and Amplify service role | No developer or build identity has broader production access than required. | Critical | IAM access review |
| AWS-06 | Confirm build logs and artifacts do not expose secrets. | Amplify logs and artifact storage | Logs redact environment values and artifacts contain no secret strings. | Critical | Redacted log review and scan |

## 4. Authentication and Account Security

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| AUTH-01 | Confirm email confirmation is enabled in production. | `supabase/config.toml` and Supabase Auth | Unverified users cannot use normal authenticated workflows. | High | Auth configuration export |
| AUTH-02 | Confirm TOTP enrollment and verification are enabled. | Supabase Auth MFA settings | TOTP enrollment and verification are enabled. | High | Configuration screenshot |
| AUTH-03 | Test MFA enforcement beyond the UI. | RLS policies and AAL1/AAL2 test sessions | AAL1 cannot access MFA-protected resources after enrollment. | Critical | SQL/API test results |
| AUTH-04 | Review MFA recovery. | `mfa-recover` function and staging account | Recovery requires password plus one unused code and never mints a session alone. | Critical | Test record and function review |
| AUTH-05 | Test password recovery for account enumeration. | `password-reset-request` and Auth email flow | Unknown and known emails receive equivalent responses and throttling applies. | High | Test cases and rate-limit logs |
| AUTH-06 | Review administrator and staff access quarterly. | `profiles`, Supabase Auth, admin panel | Every privileged account has an owner, business need, MFA, and current status. | Critical | Signed access review |

## 5. API and Edge Functions

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| API-01 | Inventory every Edge Function and its authentication mode. | `supabase/config.toml` and functions directory | Every public function has documented non-JWT authentication and abuse controls. | High | Function inventory |
| API-02 | Verify JWT validation for authenticated functions. | Function source and negative tests | Missing, expired, or wrong-user tokens receive 401/403. | Critical | API test output |
| API-03 | Verify CORS allowlists. | `_shared/cors.ts` and live preflight | Only approved production origins are allowed; untrusted origins fail. | High | CORS smoke-test output |
| API-04 | Validate all request bodies and uploaded metadata. | Function handlers | Invalid types, oversized payloads, and unsupported values are rejected. | High | Negative test matrix |
| API-05 | Enforce rate limits on public endpoints. | Public support, password reset, checkout endpoints | Repeated requests are throttled without revealing account existence. | High | Rate-limit test output |
| API-06 | Review function logs for sensitive data. | Supabase function logs | No passwords, bearer tokens, API keys, recovery codes, or private documents are logged. | High | Redacted log sample |

## 6. AI Providers and In-house AI

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| AI-01 | Confirm provider credentials stay server-side. | Edge Function secrets and built assets | No provider credential or endpoint secret is present in browser code. | Critical | Secret scan output |
| AI-02 | Review user AI configuration RLS. | `user_ai_agent_config` policies | A user can access only their own configuration. | Critical | Policy query and test |
| AI-03 | Confirm provider routing is allowlisted. | `ai-image`, `inhouse-ai`, `listening-fetch` | Users cannot make arbitrary server-side requests or choose arbitrary URLs. | Critical | Source review and SSRF tests |
| AI-04 | Define data handling for prompts and references. | Provider contracts and privacy records | Each provider has documented retention, training, region, and deletion terms. | High | Vendor review and DPA |
| AI-05 | Test prompt and media safety controls. | In-house AI contract and moderation flow | Disallowed or high-risk requests are rejected or escalated according to policy. | High | Redacted safety test set |
| AI-06 | Confirm AI observability excludes private content. | Request logs and usage records | Request IDs and usage metadata are retained without raw secrets or sensitive content. | Medium | Log schema and sample |

## 7. Social Integrations

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| SOC-01 | Verify OAuth state is single-use and user-bound. | `social-oauth` and database state table | Callback without valid state cannot connect an account. | Critical | OAuth negative tests |
| SOC-02 | Review requested provider scopes. | Provider consoles and source | Each scope is necessary, documented, and approved by the provider. | High | Scope inventory |
| SOC-03 | Keep OAuth tokens out of client-readable tables. | Social credential tables and RLS | Tokens are service-role-only or owner-protected and never returned to the UI. | Critical | Schema/policy review |
| SOC-04 | Test account disconnect and token revocation. | Connections UI and provider console | Disconnect removes local credentials and revokes access where supported. | High | Disconnect test record |
| SOC-05 | Enforce owner/company checks on publishing. | `social-publisher` and scheduling policies | A job can publish only for the authorized account owner/company. | Critical | Cross-tenant publish test |
| SOC-06 | Review provider failures and retry behavior. | Publisher logs and schedule records | Failures are recorded, retries are bounded, and duplicate publishing is prevented. | High | Failure/retry test output |

## 8. Stripe and Billing

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| STR-01 | Verify Stripe webhook signatures. | `stripe-webhook` | Invalid signatures are rejected before processing. | Critical | Replay/invalid-signature test |
| STR-02 | Verify event de-duplication. | `billing_events` and webhook replay | Replaying an event does not duplicate access, credit, or reward changes. | High | Replay test and row count |
| STR-03 | Select prices server-side. | Checkout function and `plan_catalog` | Browser input cannot replace the approved Stripe price. | Critical | Tampered checkout test |
| STR-04 | Protect billing and payment records with RLS. | `subscriptions`, `billing_payments`, `billing_events` | Customers see only their permitted records; event data is backend-only. | Critical | Policy export and test |
| STR-05 | Test entitlement transitions. | Stripe test mode and `my_entitlement()` | Success, failure, cancellation, grace, and expiry produce correct access. | High | Lifecycle test matrix |
| STR-06 | Review refunds, credits, and referral rewards. | Stripe dashboard and referral functions | Each adjustment is authorized, idempotent, traceable, and bounded. | High | Sample transaction audit |

## 9. Storage and Files

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| STO-01 | Keep customer attachments in private buckets. | Supabase Storage bucket settings | Sensitive buckets are not public. | Critical | Bucket configuration export |
| STO-02 | Enforce object ownership in storage policies. | `storage.objects` policies | Users cannot read, overwrite, or delete another user's objects. | Critical | Storage isolation tests |
| STO-03 | Use short-lived signed URLs. | Attachment service and browser network log | Private URLs expire within the approved period and are not persisted in public records. | High | Signed URL sample with expiry |
| STO-04 | Enforce file size and MIME restrictions. | Bucket configuration and upload code | Unsupported types and oversized files are rejected server-side. | High | Negative upload tests |
| STO-05 | Review generated media and document handling. | AI/editor export paths | Temporary files are not unintentionally retained or exposed. | Medium | Storage inventory and retention test |
| STO-06 | Test deletion and orphan cleanup. | User deletion workflow and storage inventory | Deleting an account removes or queues all owned files under the retention policy. | High | Deletion test and cleanup report |

## 10. Privacy and Data Governance

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| PRI-01 | Maintain a data inventory. | Privacy register | Each data category has purpose, owner, system, region, retention, and access. | High | Approved data map |
| PRI-02 | Document subprocessors. | Vendor register and privacy notice | Supabase, AWS, Stripe, AI, email, and social providers are listed as applicable. | High | Vendor/subprocessor register |
| PRI-03 | Define retention and deletion periods. | Privacy policy and database jobs | Retention is approved and implemented for accounts, logs, tickets, and media. | High | Retention schedule and job evidence |
| PRI-04 | Test user data export and deletion requests. | Account actions and support process | Requests are identity-verified, completed within policy targets, and logged. | High | Redacted request record |
| PRI-05 | Record consent and communication preferences. | Auth, analytics, support, and marketing flows | Consent is explicit, revocable, and separated by purpose where required. | Medium | UI test and database sample |
| PRI-06 | Review data-region and transfer requirements. | Supabase, AWS, and vendor settings | Regions and international transfer mechanisms match customer commitments. | High | Region/configuration evidence |

## 11. Monitoring and Auditability

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| MON-01 | Centralize authentication and privileged-action logs. | Supabase logs, function logs, admin audit tables | Login, MFA, role, billing, export, and admin actions are traceable. | High | Log source inventory |
| MON-02 | Configure alerting for suspicious events. | Supabase/AWS/Stripe monitoring | Alerts cover repeated auth failures, function errors, webhook failures, and access anomalies. | High | Alert rules and test alerts |
| MON-03 | Retain logs for the approved period. | Log retention settings | Retention meets incident-response and contractual requirements. | Medium | Retention configuration |
| MON-04 | Protect logs from ordinary users. | IAM, Supabase policies, log dashboards | Customer users cannot alter or read operational logs. | High | Access review |
| MON-05 | Monitor scheduled publisher and billing jobs. | Function logs and scheduler | Missed runs, retries, and failures are visible and actionable. | High | Job dashboard screenshot |
| MON-06 | Run recurring vulnerability and dependency scans. | CI, npm audit, dependency tooling | Findings are triaged, assigned, and remediated by policy deadlines. | Medium | Scan reports and tickets |

## 12. Incident Response

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| IR-01 | Name an incident commander and escalation contacts. | Incident response plan | 24/7 ownership and backup contacts are current. | High | Approved response plan |
| IR-02 | Define credential-compromise playbooks. | Incident response plan | Playbooks cover Supabase, AWS, Stripe, OAuth, webhook, and AI keys. | Critical | Playbook review |
| IR-03 | Test secret rotation and revocation. | Secret managers and provider consoles | A compromised key can be revoked and replaced without unsafe downtime. | Critical | Rotation exercise record |
| IR-04 | Define customer and regulator notification paths. | Legal/privacy incident plan | Severity thresholds, timelines, and approvers are documented. | High | Approved notification plan |
| IR-05 | Preserve evidence without exposing customer data. | Logging and forensic procedure | Collection is access-controlled, time-stamped, and minimally scoped. | High | Tabletop exercise notes |
| IR-06 | Run a tabletop exercise. | Security program calendar | The team completes and records a scenario exercise at least annually. | Medium | Exercise report and action items |

## 13. SOC 2 Readiness

| ID | Control and check | Where to check | PASS condition | Risk | Evidence |
|---|---|---|---|---|---|
| SOC2-01 | Assign control owners and review cadence. | GRC register | Every control has an owner, frequency, due date, and reviewer. | High | Control register |
| SOC2-02 | Maintain change-management evidence. | GitHub, CI, deployment records | Production changes have review, approval, test, and deployment evidence. | High | Sample change tickets/PRs |
| SOC2-03 | Perform joiner/mover/leaver reviews. | Identity and HR/admin records | Access is granted, changed, and revoked promptly with evidence. | Critical | Quarterly access review |
| SOC2-04 | Review vendor risk. | Vendor register | Critical vendors have security reviews, contracts, and renewal dates. | High | Vendor assessments |
| SOC2-05 | Track security training and policy acceptance. | HR/GRC system | Relevant personnel complete training and acknowledge current policies. | Medium | Training report |
| SOC2-06 | Collect continuous evidence for the audit period. | GRC evidence repository | Evidence is dated, attributable, tamper-resistant, and retained for the audit. | High | Evidence index and retention policy |

## Sign-Off

| Review | Owner | Environment | Date | Result | Notes |
|---|---|---|---|---|---|
| Engineering security review |  | Staging |  |  |  |
| Production readiness review |  | Production |  |  |  |
| Privacy/vendor review |  | Production |  |  |  |
| Executive risk acceptance |  | Production |  |  |  |

## Related Documents

- [Security Compliance Overview](./SECURITY_COMPLIANCE_OVERVIEW.md)
- [EchoAI In-house Agent Contract](./INHOUSE_AI_AGENT.md)
- [Microsoft 365 Support Reply Ingestion](./MICROSOFT_365_SUPPORT_INBOUND.md)
- [Project README](../README.md)
