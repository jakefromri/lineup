# lineup — Technical Architecture

## Service Map

| Service | Responsibility |
|---------|-----------------|
| `api` | Hono + TypeScript, Vercel serverless (port 3000). All reads/writes go through here. Owns auth resolution (manager JWT, parent access token, API key), tenant scoping, and business logic. Uses Supabase service role — RLS is a defense-in-depth backstop, not the primary access-control layer. |
| `web` | React + TypeScript + Vite + shadcn/ui (port 5173). **Parent-facing only**, no Supabase Auth: join flow, calendar, announcements. |
| `admin` | React + TypeScript + Vite + shadcn/ui (port 5174). **Manager + superadmin**, Supabase Auth required: login, calendar management, announcements, roster, team settings, and (gated by `role === 'superadmin'`) team creation/list. |
| Supabase | Postgres (data + RLS), Auth (managers + superadmin only) |

### Build approach: fork `hello-world`
Rather than building auth/RLS/invite scaffolding from scratch, Agent 04 forks `skunkworks/hello-world` (the ComposableAuth template — already has working superadmin/tenant-admin auth, RLS pattern, and invite-acceptance flow across `admin`:5174 / `web`:5173 / `api`:3000). Repurpose:
- `hello-world`'s **admin (5174)** app → lineup's `admin` app (manager dashboard + superadmin), reusing its login/invite-acceptance flow with `role: 'manager'` replacing `tenant_admin`
- `hello-world`'s **web (5173)** app → stripped of its Supabase Auth login entirely and rebuilt as the parent-facing app (join link, calendar, announcements, attendance) using the `pat_...` access-token scheme instead

Follow `hello-world/TEMPLATE.md`'s fork steps (copy, rename `@hello-world/*` → `@lineup/*`, drop `.git`/`TEMPLATE.md`, `git init`, `setup.sh`) before adding lineup-specific tables, routes, and pages.

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 + TypeScript + Vite | shadcn/ui for all components |
| Backend | Hono + TypeScript | Vercel serverless functions |
| Database | Supabase (Postgres) | Hosted, not Docker |
| Auth | Supabase Auth | Managers + superadmin only. Email/password + magic link (pattern from `world-cup-starting-11`) |
| Hosting | Vercel | One project, `api` as serverless functions under `/api` |
| Tests | Vitest + Playwright | |

## Data Model

### tenants
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| name | text | not null | |
| slug | text | unique, not null | URL-safe, used in parent-facing routes |
| join_token | text | unique, not null | Opaque token for parent join link (`/join/:join_token`) |
| status | text | not null, default `'active'`, check in (`active`,`inactive`) | |
| created_at | timestamptz | not null, default now() | |

**RLS Policies:**
- `superadmin_all` — full access for `app_metadata.role = 'superadmin'`
- `tenant_members_read_own` — managers (`app_metadata.role = 'manager'`) can `SELECT` where `id = app_metadata.tenant_id`

### memberships
Represents a manager's relationship to a team — covers both pending invites and accepted managers.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | FK → tenants, not null | |
| user_id | uuid | FK → auth.users, nullable | Null until invite accepted |
| role | text | not null, default `'manager'`, check in (`manager`) | Single role for v1 — kept as enum-like column for future roles |
| invite_token | text | unique, nullable | Set when row created as a pending invite; cleared on acceptance |
| invited_at | timestamptz | not null, default now() | |
| accepted_at | timestamptz | nullable | |

**RLS Policies:**
- `superadmin_all` — full access
- `tenant_managers_all_own` — managers can `SELECT`/`INSERT`/`UPDATE`/`DELETE` where `tenant_id = app_metadata.tenant_id`
- `self_read` — a user can `SELECT` their own membership row (`user_id = auth.uid()`) — needed for login redirect to resolve `tenant_id`

**Constraint enforced in API (not DB):** a team must always have ≥1 row with `accepted_at IS NOT NULL` — removing the last accepted manager is rejected.

### parents
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | FK → tenants, not null | |
| name | text | not null | |
| contact_email | text | nullable | |
| contact_phone | text | nullable | |
| access_token_hash | text | unique, not null | SHA-256 hash of the parent's access token (raw token shown once, on registration) |
| created_at | timestamptz | not null, default now() | |

**Constraint:** at least one of `contact_email` / `contact_phone` must be non-null (enforced in API).

**RLS Policies:**
- `superadmin_all` — full access
- `tenant_managers_read_own` — managers can `SELECT` where `tenant_id = app_metadata.tenant_id` (roster view, includes contact info)

No RLS path for parents themselves — parent-scoped requests go through `api` using the service role, after resolving `access_token_hash`.

### kids
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | FK → tenants, not null | |
| parent_id | uuid | FK → parents, not null | |
| name | text | not null | |
| archived_at | timestamptz | nullable | Set when a parent "removes" a kid. Archived kids are excluded from the parent's active kid list and from new-session attendance prompts, but rows are never hard-deleted — historical `attendance` rows referencing them remain intact and visible. |
| created_at | timestamptz | not null, default now() | |

**RLS Policies:**
- `superadmin_all`
- `tenant_managers_read_own` — managers `SELECT` where `tenant_id = app_metadata.tenant_id`

### sessions
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | FK → tenants, not null | |
| name | text | not null | |
| date | date | not null | |
| time | time | not null | |
| location | text | not null | |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null, default now() | |

**Timezone note:** `date`/`time` are stored and rendered as local wall-clock values — no UTC conversion anywhere in the stack (v1 assumes a single-location team). Do not use `timestamptz` for these columns.

**RLS Policies:**
- `superadmin_all`
- `tenant_managers_all_own` — managers full CRUD where `tenant_id = app_metadata.tenant_id`

### attendance
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | FK → tenants, not null | |
| session_id | uuid | FK → sessions, not null, on delete cascade | |
| kid_id | uuid | FK → kids, not null, on delete cascade | |
| status | text | not null, default `'no_response'`, check in (`attending`,`not_attending`,`no_response`) | |
| updated_at | timestamptz | not null, default now() | |
| | | unique (session_id, kid_id) | One row per kid per session |

**RLS Policies:**
- `superadmin_all`
- `tenant_managers_all_own` — managers full access where `tenant_id = app_metadata.tenant_id`

### announcements
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | FK → tenants, not null | |
| author_user_id | uuid | FK → auth.users, not null | |
| author_name_snapshot | text | not null | Display name at time of posting; survives manager removal |
| body_html | text | not null | Sanitized rich-text HTML |
| created_at | timestamptz | not null, default now() | |
| updated_at | timestamptz | not null, default now() | |

**RLS Policies:**
- `superadmin_all`
- `tenant_managers_all_own` — managers full CRUD where `tenant_id = app_metadata.tenant_id`

### api_keys
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| tenant_id | uuid | FK → tenants, unique, not null | One active key per team |
| key_hash | text | unique, not null | SHA-256 hash; raw key (`sk_...`) shown once on creation/regeneration |
| created_at | timestamptz | not null, default now() | |
| revoked_at | timestamptz | nullable | |

**RLS Policies:**
- `superadmin_all`
- `tenant_managers_read_own` — managers `SELECT` where `tenant_id = app_metadata.tenant_id`

**Security note:** the API never returns `key_hash` — only `exists`/`created_at`/`revoked_at`. Because Postgres RLS is row-level (not column-level), the `tenant_managers_read_own` policy as written would expose `key_hash` to a manager querying this table directly via Supabase client. The current architecture only accesses this table via the service role, so this isn't exploitable today — but if direct-from-client Supabase access to `api_keys` is ever introduced, it **must** go through a view (e.g., `api_keys_safe`) that excludes `key_hash`, with RLS applied to the view instead.

## Auth Model

### Managers & superadmin
- Supabase Auth, email/password with magic-link sign-in option (pattern from `world-cup-starting-11`'s `Login.tsx` / `AuthCallback.tsx` / `useAuth.ts`, adapted to drop the synthetic-email/username layer — managers use real email).
- On manager invite acceptance (`POST /api/invites/:token/accept`): API creates the Supabase Auth user via service role with `app_metadata = { role: 'manager', tenant_id }`, updates the `memberships` row (`user_id`, `accepted_at`, clears `invite_token`).
- Superadmin (Jake) is created once, manually, during environment setup: `app_metadata = { role: 'superadmin' }` (no `tenant_id`). No invite flow for superadmin in v1.
- JWT `app_metadata` contains **IDs/role only** (`role`, `tenant_id`) — no slugs or names. After login, `web` calls `GET /api/team` to fetch display data.
- JWT expiry: handled by Supabase client's automatic refresh. If refresh fails (expired session), `api` returns `401`; `web` redirects to `/login`.

### Parents
- No Supabase Auth account. On join-link completion (`POST /api/join/:joinToken`), API generates a random 32-byte token, returns it **once** in the response as `access_token` (format `pat_<random>`), and stores only `SHA-256(access_token)` in `parents.access_token_hash`.
- `web` stores the raw token in `localStorage`. All subsequent parent requests send `Authorization: Bearer pat_<token>`.
- `api` middleware hashes the incoming token and looks up `parents` by `access_token_hash` to resolve `tenant_id` + `parent_id`. No expiry in v1 (matches "no accounts" requirement) — losing the token means re-registering (new parent record, per scope).

### API keys
- Format `sk_<random>`, stored hashed as `api_keys.key_hash`. Sent as `Authorization: Bearer sk_<token>`.
- Middleware checks the token prefix to route to the correct auth strategy: `sk_` → API key lookup (scope: sessions only), `pat_` → parent lookup, anything else → verify as Supabase JWT.
- API-key-authenticated requests are restricted (at the route level, not just middleware) to `POST/PATCH/DELETE /api/sessions*` and `GET /api/sessions*`.

## Tenancy Implementation

- **DB**: every team-scoped table has `tenant_id`. RLS policies exist on every table (see Data Model) as a backstop for `superadmin_all` and manager read access — but `api` uses the Supabase service role for all operations and is the actual enforcement point.
- **API**: a shared `resolveAuthContext` middleware runs on every request, producing `{ type: 'manager'|'superadmin'|'parent'|'apikey', tenantId, ... }` (or rejecting with `401` if the credential is missing/invalid). Every handler derives `tenant_id` from this context — **never** from the request body, query params, or route params (except the public join/invite-accept endpoints, which resolve `tenant_id` from the token in the URL path).
- **Role enforcement**: every route declares the context type(s) it accepts (e.g., `manager`, `manager|apikey`, `parent`, `manager|parent`, `superadmin`). A second middleware (`requireContext(...)`) checks the resolved context type against the route's allowlist; a valid-but-wrong-type context (e.g., a parent token on a manager-only route) returns `403`. This is distinct from the `401` returned for missing/invalid credentials.
- **Tenant active-status check**: immediately after auth resolution (for `manager`, `parent`, and `apikey` context types — not `superadmin`), the middleware loads `tenants.status` for the resolved `tenant_id`. If `status = 'inactive'`, the request short-circuits with `403 { error: { code: 'team_inactive', message: '...' } }` for every route, including API-key-authenticated session writes.
- **UI**: `web` routes are split into three trees — `/admin/*` (superadmin, checks `role === 'superadmin'`), `/manager/*` (checks `role === 'manager'`, all data scoped server-side to the manager's `tenant_id`), and `/t/:slug/*` (parent-facing: join, calendar, announcements — `slug` is cosmetic/routing only, real scoping comes from the parent's access token).

## Environments & Deployment

| Environment | Database | Hosting | Git Branch | Purpose |
|---|---|---|---|---|
| Local | `lineup-dev` Supabase | localhost:5173 (web) / localhost:3000 (api via `vercel dev`) | `feature/*` | Development |
| Dev/Staging | `lineup-dev` Supabase | `lineup-dev.vercel.app` | `dev` | QA & integration testing |
| Production | `lineup-prod` Supabase | custom domain (TBD) or `lineup.vercel.app` | `main` (protected) | Live — Jake's team |

### Database Projects
- **Dev project:** `lineup-dev` (Supabase). Local dev + staging.
- **Prod project:** `lineup-prod` (Supabase). Production only.
- Identical schema via `supabase db push` to both. Data separate.

### Git Workflow
- Feature branches developed locally, PR → `dev` (`--base dev`), never directly to `main`
- `dev` → `main` is a separate PR after dev verification
- `main` protected (require PR, 0 approvals for solo project)

### Vercel Configuration
- Single Vercel project; `apps/web` as the static/SPA build, `apps/api` functions under `/api`
- Env vars scoped: Preview (dev Supabase keys) vs Production (prod Supabase keys)
- `SUPABASE_SERVICE_ROLE_KEY` never prefixed `VITE_`; set per-environment in Vercel dashboard

### Before Promoting to Production
- [ ] Feature tested in dev against `lineup-dev` Supabase
- [ ] No console errors
- [ ] RLS verified (manager cannot read another tenant's data even with service-role-bypass paths double-checked)
- [ ] Mobile responsive (parent calendar/announcements views, primary usage surface)
- [ ] PR created, reviewed, approved

Reference: `/skunkworks/_ralph-loop/ENVIRONMENT_MANAGEMENT.md`

## API Endpoints

All responses are JSON. Errors: `{ error: { code: string, message: string } }`.

### Public

#### GET /api/join/:joinToken
- **Auth**: none
- **Request**: —
- **Response**: `{ teamName: string, teamSlug: string }`
- **Errors**: `404` (invalid/revoked token), `403` (team inactive)

#### POST /api/join/:joinToken
- **Auth**: none
- **Request**: `{ parentName: string, contactEmail?: string, contactPhone?: string, kids: { name: string }[] }` (at least one of `contactEmail`/`contactPhone` required, `kids` non-empty)
- **Response**: `{ accessToken: string, parent: { id, name }, kids: { id, name }[] }`
- **Errors**: `400` (validation), `404` (invalid token), `403` (team inactive)

#### POST /api/invites/:token/accept
- **Auth**: none
- **Request**: `{ email: string, password: string }` (password ≥10 chars)
- **Response**: `{ success: true }` — client then signs in via Supabase
- **Errors**: `400` (validation/weak password), `404` (invalid token), `409` (already accepted)

### Superadmin

#### POST /api/teams
- **Auth**: superadmin
- **Request**: `{ name: string, slug: string }`
- **Response**: `{ team: { id, name, slug, joinToken }, managerInviteUrl: string, parentJoinUrl: string }`
- **Errors**: `400`, `409` (slug taken)

#### GET /api/teams
- **Auth**: superadmin
- **Response**: `{ teams: { id, name, slug, status, managerCount, parentCount }[] }`

#### PATCH /api/teams/:id
- **Auth**: superadmin
- **Request**: `{ status: 'active' | 'inactive' }`
- **Response**: `{ team: {...} }`
- **Errors**: `404`

### Manager — team settings

#### GET /api/team
- **Auth**: manager
- **Response**: `{ team: { id, name, slug, status, parentJoinUrl }, apiKey: { exists: boolean, createdAt?: string, revokedAt?: string }, managers: { id, email, acceptedAt }[] }`

#### PATCH /api/team
- **Auth**: manager
- **Request**: `{ name: string }`
- **Response**: `{ team: {...} }`
- **Errors**: `400`

#### POST /api/team/join-link/regenerate
- **Auth**: manager
- **Response**: `{ parentJoinUrl: string }`

#### POST /api/team/api-key/regenerate
- **Auth**: manager
- **Response**: `{ apiKey: string }` (raw key, shown once)

#### POST /api/team/managers/invite
- **Auth**: manager
- **Response**: `{ inviteUrl: string }`

#### DELETE /api/team/managers/:membershipId
- **Auth**: manager
- **Response**: `{ success: true }`
- **Errors**: `409` (would remove last manager), `404`

### Roster

#### GET /api/roster
- **Auth**: manager
- **Response**: `{ parents: { id, name, contactEmail, contactPhone, kids: { id, name }[] }[] }`

### Parent profile

#### GET /api/me
- **Auth**: parent
- **Response**: `{ parent: { id, name, contactEmail, contactPhone }, kids: { id, name }[] }`
- **Errors**: `401`

#### PATCH /api/me
- **Auth**: parent
- **Request**: `{ name?: string, contactEmail?: string, contactPhone?: string }`
- **Response**: `{ parent: {...} }`
- **Errors**: `400` (would leave both email and phone null)

#### POST /api/me/kids
- **Auth**: parent
- **Request**: `{ name: string }`
- **Response**: `{ kid: { id, name } }`

#### PATCH /api/kids/:id
- **Auth**: parent (own kid only)
- **Request**: `{ name?: string, archived?: boolean }`
- **Response**: `{ kid: { id, name, archivedAt: string | null } }`
- **Notes**: `archived: true` sets `archived_at = now()` (soft delete — see Data Model). `archived: false` clears it (un-archive). Attendance rows are never deleted by this endpoint.
- **Errors**: `403` (not owner), `404`

### Sessions

#### GET /api/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
- **Auth**: manager, parent, or apikey
- **Response**: `{ sessions: { id, name, date, time, location, attendance: { kidId, kidName, status }[] }[] }`
- **Notes**: `attendance` array includes every non-archived kid on the team — attendance is visible to all parents, so all kids' attendance is returned regardless of caller. Archived kids are omitted from the `attendance` array for *future* sessions but retained for sessions in the past at the time of archiving. Default range: today → +4 weeks if `from`/`to` omitted.

#### POST /api/sessions
- **Auth**: manager or API key
- **Request**: `{ name: string, date: string, time: string, location: string }`
- **Response**: `{ session: {...} }`
- **Errors**: `400`

#### PATCH /api/sessions/:id
- **Auth**: manager or API key
- **Request**: `{ name?, date?, time?, location? }`
- **Response**: `{ session: {...} }`
- **Errors**: `400`, `404`

#### DELETE /api/sessions/:id
- **Auth**: manager or API key
- **Response**: `{ success: true }` — cascades to attendance rows
- **Errors**: `404`

### Attendance

#### PUT /api/sessions/:id/attendance
- **Auth**: parent
- **Request**: `{ updates: { kidId: string, status: 'attending' | 'not_attending' | 'no_response' }[] }` — `kidId` must belong to calling parent
- **Response**: `{ attendance: { kidId, status }[] }`
- **Errors**: `403` (kid not owned by caller), `404` (session not found)

### Announcements

#### GET /api/announcements
- **Auth**: manager or parent
- **Response**: `{ announcements: { id, authorName, bodyHtml, createdAt, updatedAt }[] }` (newest first)

#### POST /api/announcements
- **Auth**: manager
- **Request**: `{ bodyHtml: string }` — rejected with `400` if empty or whitespace-only after stripping HTML tags
- **Response**: `{ announcement: {...} }`
- **Errors**: `400`

#### PATCH /api/announcements/:id
- **Auth**: manager
- **Request**: `{ bodyHtml: string }` — same non-empty validation as POST
- **Response**: `{ announcement: {...} }`
- **Errors**: `400`, `404`

#### DELETE /api/announcements/:id
- **Auth**: manager
- **Response**: `{ success: true }`
- **Errors**: `404`

## Admin Panel

Per the Service Map, these routes are split across two apps: `admin` (port 5174, manager + superadmin, Supabase Auth) and `web` (port 5173, parent-facing, access-token based).

### `admin` app (5174) — Superadmin routes (`/admin/*`)
- `/admin/teams` — list teams, create team (returns invite URLs), activate/deactivate

### `admin` app (5174) — Manager routes (`/manager/*`)
- `/manager/login` — Supabase login (email/password + magic link)
- `/manager/calendar` — session list/calendar, create/edit/delete sessions
- `/manager/announcements` — create/edit/delete announcements
- `/manager/roster` — view parents, kids, attendance
- `/manager/team` — team settings: rename, join link, API key, manager list/invite/remove

### `web` app (5173) — Parent routes (`/t/:slug/*`, `/join/:joinToken`)
- `/join/:joinToken` — registration form (parent + kid info)
- `/t/:slug/calendar` — 4-week calendar view, mark attendance
- `/t/:slug/announcements` — read-only feed

## Environment Variables

### `apps/api/.env`

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (never `VITE_` prefixed) | Yes |
| `WEB_URL` | Parent app origin — used for join links + CORS (local: `http://localhost:5173`) | Yes |
| `ADMIN_URL` | Manager/superadmin app origin — used for invite links + CORS (local: `http://localhost:5174`) | Yes |
| `PORT` | API server port (local: `3000`) | Yes |

### `apps/web/.env` (parent-facing app)

Parents authenticate with `pat_` access tokens stored in `localStorage`, not Supabase Auth, so this app does not need any Supabase credentials.

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Base URL for `api` (local: `http://localhost:3000`) | Yes |

### `apps/admin/.env` (manager/superadmin app)

Managers and superadmins authenticate via Supabase Auth.

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Anon key | Yes |
| `VITE_API_URL` | Base URL for `api` (local: `http://localhost:3000`) | Yes |
| `VITE_WEB_URL` | Parent app origin, used for displaying join links (local: `http://localhost:5173`) | Yes |

## Build Sizing Note

8 tables and 2 frontend route-trees within 1 app are within the single-pass Agent 04 threshold, but the API surface (~24 endpoints) is moderately above the README's ~20-endpoint guideline. **Recommendation**: Agent 04 should use the phased builder pattern (04a Foundation → 04b API → 04c Frontend → 04d Tests) with a 04-review checkpoint after 04a (schema) and 04b (API), to avoid stub/placeholder output.
