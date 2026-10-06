# EchoAI

EchoAI is a React and Supabase workspace for creating, scheduling, publishing,
and analyzing social content. It combines campaign planning, media creation,
social connections, support workflows, analytics, and team controls in one web
application.

### Video Editor visual organization

Video Editor uses the same white/slate workspace surfaces, violet editing
accents, compact desktop controls, and shared rotating Focus button as Photo
Editor. Undo/Redo and Export video live in the top document-command group;
Screen Capture is a dropdown immediately after Stock library in the quick
toolbar (screen, screen with audio, or voice-over), without a separate recording
row. An active recording replaces the selector with its clock and Stop action.
Media/tools appear on the left, preview/timeline in the center, and video/audio/
color/animation properties in the inspector. Tablet layouts move the inspector
below the workspace instead of hiding it; narrow screens wrap tool rows and use
larger touch controls.

These are presentation changes only: timelines, clip timing, rendering/export,
audio processing, recording, transitions, and project settings retain their
video-specific behavior. All new styling is scoped to Video Editor, and Help
Center instructions describe its controls separately from Photo Editor.

The video panels include 12 built-in entrance/exit transitions, 19 color filters,
and 9 adjustment presets, ready without stock-library requests. Grouped cards
preview color looks and animate motion on hover/focus (respecting reduced
motion). Apply them to unlocked video/image clips with undo support. Effect
presets replace adjustment values; filters stack independently and existing
sliders remain available. Transition variants use the same shared definitions
for preview and export; legacy preset IDs retain their usual timing/geometry.
Entrance/exit durations are capped at half the clip duration on short clips
so the ramps cannot overlap or jump.

"Looking for something more?" opens contextual stock searches from Transitions,
Effects, Filters, Text, and Elements. Stock footage/artwork is media, not an
editable transition/filter/plugin. Results depend on workspace/library access;
the app does not bundle or automatically download thousands of licensed files.

## Current Product

- Dashboard for workspace activity, connected accounts, announcements, and
  account status.
- Create Desk for campaign copy, briefs, personas, and hosted AI workflows.
- Photo Editor and Video Editor for image and video editing and export.
- Post Creation for scheduling posts and managing publishing work.
- Analytics for social listening and external-source monitoring.
- Repost for company post distribution and repost workflows.
- Connections for social accounts, cloud drives, AI providers, and billing.
- Brand kits for company colors, fonts, logos, and creative defaults.
- Analytics, advertising, finance, board, and administrative workspaces for
  authorized staff.
- Help Center, support tickets, inbound customer email replies, and ticket
  notifications.

### Photo Editor workspaces

Inside a design, use the **Simple / Classic** selector in the editor's top bar.
Simple is the default guided workspace; Classic exposes the existing traditional
menus, tool dock, tool-options bar, and layers/property inspector. Both use the
same document and editing engine: switching does not reset edits, selection,
undo/redo history, or export settings. The home page and project management are
unchanged, and the workspace preference is remembered in this browser separately
from saved design files. If browser storage is unavailable, switching still
works but the preference cannot be remembered.

Classic is a layout for EchoAI's current tools, not CorelDRAW file compatibility
or a complete vector-design suite.

Classic has a dedicated compact **File / Edit / View / Layout / Object /
Effects / Bitmaps / Text / Tools / Window / Help** menu row. Simple retains its
existing menu layout. Commands reuse the same document/history operations as
the toolbox, quick toolbar, and inspector; unavailable selection-dependent
commands are disabled. Menu arrows navigate commands and adjacent menus,
Home/End jump within a menu, Enter activates, and Escape restores trigger
focus. Popups stay within the viewport and scroll independently.

Layout opens page setup/background controls. Object exposes single-page or
reference-object alignment, distribution, stacking, flat grouping, locks,
visibility, and rotation reset. Bring to front/Send to back preserve selection
order; Show all/Unlock all affect design objects, not the original photo.
Text case and alignment changes support unlocked text selections and undo.
Edit distinguishes design-object selection from photo-pixel selection
(Ctrl+A). Effects operates on the original photo except explicitly named text
effects/object transparency; Bitmaps provides existing photo/mask/rasterization
operations. Window opens/restores docks; Help opens Classic training and
shortcuts. Vector boolean shaping, tracing, editable tables, multipage documents,
CMYK workflows, and native desktop automation are not advertised as implemented.

The Classic toolbox groups Pick, Crop & pixel editing, Navigation, Drawing,
Geometric shapes, Text, Photo selections, and Fill. Arrow buttons open flyouts
with tool descriptions and existing shortcuts. Use Up/Down or Home/End to
navigate, Enter to choose, and Escape to dismiss. Each group remembers its last
choice while the toolbox is open. Shape and text buttons insert editable objects
immediately; photo selections operate on image pixels, not vector nodes.
Pan moves only the canvas view with a left-button drag (Ctrl + right-button drag
also remains available). Pick exposes object rotation and opacity in the top
options bar; the inspector provides further properties. Vector node editing,
Knife, advanced curve tools, and other unsupported features are not advertised
as working controls.

Classic's inspector has **Objects**, **Properties**, and **Canvas** views.
Objects provides selection, renaming, visibility, stacking, and layer actions.
Properties adds numeric position and shape dimensions in canvas pixels, image
width with its aspect ratio preserved, text size, rotation, and opacity.
Numeric geometry edits apply on blur or Enter and create one undo step; Escape
cancels the draft. Invalid or empty values are rejected with a visible message.
Positions refer to the existing object anchor, not the top-left bounding box.
Center X/Y anchor actions position that anchor at the canvas midpoint.
With Pick active and the canvas focused, arrow keys nudge by one canvas pixel
(ten with Shift), independently of zoom. Canvas contains photo adjustments,
export settings, and brand resources. Simple retains the combined inspector.

With Classic Pick active, selected shapes, non-base images, and stickers have
corner resize handles and a rotation handle. Resizing keeps the center fixed;
image/sticker proportions are always preserved, and Shift preserves shape
proportions. Shift while rotating snaps to 15-degree increments. Arrow Up/Down
on a focused resize handle scales by 2%; Left/Right on the rotation handle
rotates by one degree (15 with Shift). Each completed gesture is one undo step;
Escape, pointer cancellation, or loss of window focus restores the initial
geometry. Text uses its existing numeric size/rotation controls rather than
vector-style handles. Handles are editing overlays and are not exported.
Properties also includes six canvas-alignment actions based on the rendered,
rotated object bounds, distinct from the center-anchor actions. Hidden objects
cannot be aligned; oversized objects whose alignment would move their anchor
outside the canvas produce a visible error.

Classic supports multiple design-object selection with Shift-click in the
canvas or Objects list. Pick selects visible members of a saved group; Alt-click
selects one member. "Select all design objects" excludes the original photo and
hidden objects; Ctrl+A continues to mean photo-pixel selection. Escape or Clear
selection clears design-object selection. Groups are flat, non-destructive
associations stored on the layers, preserving their properties and stacking
order across project save/open. Group with Ctrl+G and ungroup with Ctrl+Shift+G;
grouping an existing selection replaces its previous associations (no nested
groups). Ungroup removes the association from all members, including hidden
ones. Simple remains single-object editing and preserves saved associations.

Selected objects can be dragged/nudged, duplicated, deleted, or moved through
the stack together, with one undo step per operation. Movement clamps the
selection as a unit at canvas-anchor boundaries to preserve relative spacing.
Multi-object alignment matches rendered edges/centers to the last picked
reference object, accounting for rotation and zoom. Hidden objects and the
original photo cannot participate in group movement/alignment. Duplicate
selection creates independent group IDs; Delete preserves the existing rule
requiring at least one layer. Individual transform handles and properties are
hidden for multi-selection; Alt-click a member to edit it independently.

Copy/Paste (Ctrl+C/Ctrl+V in Classic) preserves multi-object content and creates
independent group IDs when pasted. Clipboard Cut, Rename, and Merge Down remain
single-object commands and are disabled for multi-selection; Alt-click a member
to use them. Clipboard failures are reported, and Cut only removes an object
after the clipboard write succeeds.
If the document changes while clipboard access is pending, Cut/Paste reports
the conflict rather than applying an edit to stale document state.

With Classic Pick/Move active, drag on empty canvas to select objects whose
rendered bounds are fully inside the box. Shift-drag adds to the selection;
Alt-drag picks individual group members instead of expanding groups. Dragging
in either direction works at zoom/pan. A blank click clears selection, and
Escape or a canceled pointer gesture cancels the box without changing selection.
Hidden objects and the original photo are excluded.

The Objects list and layer context menu can lock/unlock design objects; the
selection panel can lock/unlock a whole selection. Locks are saved in projects
and undoable. Locked objects remain selectable, inspectable, and hideable, but
cannot be moved, resized, edited, deleted, regrouped, merged, or reordered in
either workspace. Pixel editing of locked image objects is blocked, and
flattening requires unlocking all objects first. Copies/pastes are unlocked.
Simple also exposes Unlock in the inspector for locked objects. Locks protect
object content/geometry, not global canvas settings, photo effects, or document
replacement. The original photo uses its existing separate controls.

For three or more visible, unlocked design objects, the selection panel offers
horizontal/vertical distribution by centers or equal edge gaps. Measurements
account for rotation and zoom; the two outer objects remain fixed and a complete
distribution is one undo step. Equal gaps reject insufficient space rather than
overlapping objects or partially applying the operation.

Classic's **Snap** toggle (on by default for the editor session) snaps Pick/Move
drags to canvas and visible object edges/centers within six screen pixels.
Dashed magenta guides show the active horizontal/vertical alignment and disappear
when the drag finishes or is canceled. Multi-object selections snap using their
combined rendered bounds, preserving relative spacing. Rotated objects, zoom,
and pan are accounted for. Hidden objects, the original photo, and moving
objects are not targets; locked design objects can still serve as references.
Hold Alt **during** a drag to bypass snapping; Alt at the start still picks an
individual group member. Turn Snap off for unrestricted dragging. Snapping does
not change arrow-key nudges, numeric properties, resize/rotation handles, Simple
editing, or exported output, and the preference is not part of the document.

Run the workspace browser regression checks with
`node --test tests/photoEditorWorkspace.browser.test.js` (requires Playwright's
Chromium browser).

### Photo Editor user training

Help Center has separate **Photo Editor - Simple** and **Photo Editor - Classic**
categories, with mode-specific tool locations and workflows. Design School has
independent **Simple training**, **Classic training**, and **Design foundations**
learning paths; completion progress is calculated per path. The Tutorials icon
beside the editor workspace switch opens the current mode's training. Return to
current design leaves the artwork unchanged. Starting prepared practice loads a
training template and activates its intended workspace; save a project backup
first. A practice checklist shows its mode and offers a return-to-mode action
when the user switches layouts.

Knowledge-base guides and the corresponding training lessons share the content
in `src/data/photoEditorTraining.js`. Simple covers guided panels, photo tools,
text/layers, and save/export; Classic covers the toolbox/quick bars, objects,
page measurements, photo tools, and editable project workflows. Shortcut help
identifies the active mode and hides Classic-only object instructions in Simple.

### Classic layout and measurements

Classic uses a compact desktop hierarchy: menu row, command toolbar, page setup,
then active-tool options. Desktop toolbox buttons are 30 px high with 17 px
icons, toolbar controls are 26–28 px high, and touch devices retain larger targets.
Focus on editing keeps the shared rotating rainbow rim and dark pill colors in
both workspaces, with compact sizing in Classic and no rotation when reduced
motion is requested.
Document-wide commands stay separate from active-tool options, and blank-page
upload/stock shortcuts sit outside the artwork. Simple and the shared landing
page retain their existing layout.

The quick toolbar provides New/Open image/Open project/Save project, object
Cut/Copy/Paste, photo commands, numeric zoom (25–400%), Fit, and Rulers/Grid/Guides/
Snap toggles. Grid and center guides are visual aids; Snap targets page/object
edges and centers, not grid intersections. The unit-aware Nudge field sets the
Classic arrow-key distance (default 1 canvas pixel, Shift multiplies it by ten);
switching units preserves that distance. Zoom, nudge, and view toggles are
workspace settings, not artwork changes or document undo steps.

The left toolbox gives direct rectangle and ellipse access, grouped line/brush
and polygon/star/triangle tools, plus shortcuts to object fill/outline and
transparency properties. Polygon currently inserts a six-sided polygon; Star
inserts a five-point star. Both remain editable, support fill/outline/opacity,
and use shared geometry for preview and raster export. Advanced node editing,
Bézier paths, mesh fills, and dimension-line objects are not implemented or
represented by nonfunctional buttons.

Page setup and Custom size creation support pixels, inches, and millimeters with
an explicit 36–1200 PPI resolution. New Print/Docs presets default to 300 PPI;
existing projects without measurement metadata remain pixel documents at 96 PPI.
Physical dimensions convert to whole pixels; page dimensions must resolve to
40–8192 pixels per side. Unit switches immediately update rulers and object
properties without resizing the artwork or applying unfinished size/resolution
edits. Size and resolution changes still require Apply page setup. Applying a
different resolution while using physical units changes the output pixel size;
in pixel units, resolution changes physical interpretation without resampling.
Page setup changes are undoable and saved through autosave/project save/open.
Objects retain percentage-based positions and dimensions when the page changes.

Classic rulers are enabled by default, outside the artwork, with actual unit
ticks anchored at the page's top-left. Ticks adapt to zoom/pan and can show negative
workspace coordinates. Toggle them in View → Rulers. The contextual object bar
and Properties panel share geometry controls using the document's units; text
size retains the editor's existing sizing behavior. This is not a vector
dimension-line tool. Export still produces the existing raster formats and pixel
dimensions; PPI is document metadata, not an embedded print-resolution guarantee
in downloaded files.

## Social Platforms

Publishing adapters currently available:

- Facebook Pages
- Instagram Professional accounts
- YouTube
- X
- LinkedIn

The catalog also includes Twitch, Google Business Profile, and Pinterest as
planned destinations. Availability still depends on each provider's OAuth
approval, scopes, account type, and API permissions.

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

### Google account signup

Account signup uses the Supabase Google Auth provider, not the social
publishing app credentials in the employee Developer Apps panel. In Supabase
Dashboard -> Authentication -> Sign In / Providers -> Google, save the real
Google web OAuth client ID and client secret.

- Google client IDs end in `.apps.googleusercontent.com`. Create a Web
  application client in Google Cloud Console and authorize the site origins
  `https://www.echoaipro.com` and `https://echoaipro.com`.
- Register `https://yxmsqrtoghrazfwweqqf.supabase.co/auth/v1/callback` as the
  authorized redirect URI in Google for the current production project. Other
  environments must use their own project callback.
- Google `401: invalid_client` / "OAuth client was not found" indicates an
  invalid or placeholder provider ID. Edge Function secrets do not configure
  hosted Auth providers, and client secrets must never go into frontend env vars.

### Employee alerts

Admin, Super Admin, IT, and Accounting accounts have an employee notification
bell throughout the signed-in workspace. IT/admin alerts cover new support
tickets; all employee roles receive new company forum posts, group messages,
and private messages addressed to them. Self-authored posts/messages are skipped.
The action opens the ticket workspace or the appropriate forum/chat view.

The watcher uses authenticated, RLS-protected queries, realtime insert events
where publication is enabled, and a 10-second polling fallback. Forum/chat
streams also refresh every 10 seconds. Alerts and read status persist per user
in the current browser (up to 100 recent alerts); events catch up from the last
successful check after reload. Monitoring starts on the employee's first visit.
Focus editing hides both popups and the bell without discarding incoming alerts.
These are in-app alerts, not background OS/push notifications after the app closes.

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
