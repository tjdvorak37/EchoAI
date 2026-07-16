# EchoAI

EchoAI is a JavaScript + Supabase social media scheduling platform built for teams who want to create multiple posts in one session and automatically deploy them throughout the day.

## Core Features Included

- User authentication with login, signup, password reset, and two-factor verification flow.
- Automatic account access request tickets on signup, requiring Management/IT approval before first login.
- User dashboard with connected social channels and campaign queue visibility.
- Company post syndication hub with notifications, approval board, copy/repost flow, and user-branded repost captions.
- Post scheduler with channel selection, message composition, image brief, and timed deployment queue.
- AI message studio for copy ideas, image prompts, and campaign suggestions.
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

4. Start development server:

```bash
npm run dev
```

## Supabase Integration Notes

- Authentication methods are in `src/services/authService.js`.
- Repost workflow service methods are in `src/services/repostService.js`.
- Post scheduling and AI hooks are in `src/services/platformService.js`.
- Supabase client bootstrap is in `src/lib/supabase.js`.
- Without env configuration, the app runs in demo mode for UI prototyping.

## Repost Migration Setup

1. Apply the migration in `supabase/migrations/20260716_repost_multitenant.sql` to your Supabase project.
2. Apply `supabase/migrations/20260716_repost_broadcast_rpc.sql` to enable admin broadcast queueing.
3. Apply `supabase/migrations/20260716_support_tickets.sql` to enable support ticket submission.
4. Ensure each authenticated user has a `profiles.company` value set. Tenant isolation for repost tables is enforced by this field.
5. Ensure admin users have `profiles.role = 'admin'` to manage company main posts and company social accounts.
6. Ensure users have `profiles.access_status = 'active'` if they should receive admin broadcast notifications.

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
- Add role-based access (user, manager, IT-admin) and audit logs.
