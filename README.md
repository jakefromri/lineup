# lineup

A mobile-first scheduling app for youth sports/activity teams. Managers publish training
sessions and announcements; parents open a shared link — no account required — to view the
calendar and mark their kids' attendance.

## How it works

- **Superadmin** (Jake) creates teams. Creating a team atomically generates a manager invite
  link and a parent join link.
- **Managers** accept their invite (Supabase Auth signup), then create/edit/delete training
  sessions, post rich-text announcements, manage the roster, invite/remove other managers, and
  regenerate the team's join link and API key.
- **Parents** open the join link, register their contact info and kid(s) — no password — and
  get a long-lived access token stored in their browser. From there they see a 4-week rolling
  calendar, mark each kid attending / not attending per session, and read announcements.
- **Claude / automation** can bulk-create sessions for a team via a per-team API key
  (`sk_...`), scoped to session create/update/delete only.

## Architecture

| App | Stack | Port | Audience |
|-----|-------|------|----------|
| `apps/api` | Hono + TypeScript (Vercel serverless) | 3000 | All reads/writes. Resolves auth (manager JWT, parent access token, or API key) and enforces tenant scoping. |
| `apps/admin` | React + TS + Vite + shadcn/ui | 5174 | Managers + superadmin. Supabase Auth required. |
| `apps/web` | React + TS + Vite + shadcn/ui | 5173 | Parents. No Supabase Auth — `pat_...` access tokens in `localStorage`. |
| `packages/types` | Shared TypeScript types | — | Used by all three apps. |
| Supabase | Postgres + RLS + Auth | — | Auth is managers/superadmin only. RLS is defense-in-depth; `api` uses the service role and is the primary access-control layer. |

### Auth model

| Credential | Used by | Notes |
|------------|---------|-------|
| Supabase JWT | managers, superadmin | `app_metadata` holds `role` and `tenant_id` (IDs only — no slugs/names). |
| `pat_<random>` access token | parents | Issued on join-link registration, stored in `localStorage` as `lineup_token_<slug>`. Lost token = re-register (creates a new, unmerged parent record). |
| `sk_<random>` API key | Claude / automation | Per-team, session-scoped only (no roster, announcements, or team settings access). |

### Data model

8 tables, all team-scoped via `tenant_id`: `tenants`, `memberships`, `parents`, `kids`,
`sessions`, `attendance`, `announcements`, `api_keys`. Full schema and RLS policies in
`supabase/migrations/0001_initial_schema.sql`; design rationale in `architecture.md`.

## Setup

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) and Node 20+.

```bash
bash setup.sh
```

This will:
1. Log you into Supabase and let you create or select a project
2. Write `apps/api/.env`, `apps/web/.env`, `apps/admin/.env`
3. Link the project and push the schema migration
4. Create the superadmin user (email configured in `setup.sh`)
5. Run `npm install`

See `.env.example` for what each app needs if you'd rather set env vars by hand.

## Development

```bash
npm run dev          # starts api (3000), web (5173), admin (5174) together
npm run typecheck    # across all workspaces
npm run build        # across all workspaces
```

## Testing

```bash
npm run test         # vitest integration tests (apps/api) — requires the api running on :3000
                      # and apps/api/.env populated with a real Supabase project
npm run test:e2e     # playwright e2e — requires api, web, and admin all running
```

`apps/api/tests/unit` runs standalone with no environment setup.

## Typical flows

**Onboarding a new team** (superadmin, `/admin/teams`): create team → share the returned
manager invite URL with the first manager and the parent join URL with families.

**Manager**: accept invite at `/accept-invite/:token` → `/manager/calendar` to create
sessions → `/manager/announcements` to post updates → `/manager/roster` to see registered
parents/kids/attendance → `/manager/team` to manage other managers, the join link, and the
API key.

**Parent**: open `/join/:joinToken` → register name + contact + kid(s) → land on
`/t/:slug/calendar` to view sessions and mark attendance, `/t/:slug/announcements` for
read-only updates.

**Claude bulk-scheduling**: a manager generates an API key in `/manager/team`, then
`POST /api/sessions` (with `name`, `date`, `time`, `location`) using `Authorization: Bearer
sk_...` to populate a season's schedule.

## Repo layout

```
apps/
  api/      Hono API — routes, middleware, lib (auth context, tokens, validation)
  admin/    manager + superadmin app
  web/      parent-facing app
packages/
  types/    shared TypeScript types
supabase/
  migrations/   schema + RLS
e2e/        Playwright specs (cross-app flows)
```

## Deployment

Follows Jake's standard three-environment workflow (local → dev → prod) — see
`/Users/jakericciardi/brian/CLAUDE.md` and `/skunkworks/_ralph-loop/ENVIRONMENT_MANAGEMENT.md`
for branch strategy, PR rules, and the full deploy sequence.

### Vercel setup (three projects)

| Project | rootDirectory | Notes |
|---------|--------------|-------|
| `lineup-api` | `apps/api` | Hono Edge function via `hono/vercel` |
| `lineup-web` | `apps/web` | Vite SPA |
| `lineup-admin` | `apps/admin` | Vite SPA |

**`apps/api/vercel.json` — critical settings:**
```json
{
  "installCommand": "cd ../.. && npm install",
  "buildCommand": "cd ../.. && npm run build --workspace=packages/types && npm run build --workspace=apps/api",
  "rewrites": [{ "source": "/(.*)", "destination": "/api" }]
}
```
- `installCommand` must run from the repo root so npm resolves workspace packages (`@lineup/types`)
- `packages/types` must be built before `apps/api` — its `dist/` is committed and gitignore-excepted (`!packages/types/dist/`)
- The API function runs on **Edge runtime** (`export const config = { runtime: 'edge' }` in `api/index.ts`) — do not switch to Node.js runtime; `hono/vercel`'s `handle()` only works with Web API `Request` objects which Edge provides

**`apps/web/vercel.json` and `apps/admin/vercel.json` — critical settings:**
```json
{
  "buildCommand": "cd ../.. && npm run build --workspace=apps/<app>",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
- The `rewrites` catch-all is required — without it, direct navigation to `/join/:token` or `/accept-invite/:token` returns Vercel 404 instead of loading the React app

**Env var timing:** `VITE_*` vars and Edge function env vars are baked in at **build time**, not runtime. Changing them in the Vercel dashboard takes effect on the next deployment only — trigger a redeploy after any env var change.

### Node.js / crypto compatibility

The `src/lib/tokens.ts` functions use **Web Crypto API** (`globalThis.crypto`), not Node.js `crypto`. This is intentional — Node.js `crypto` is unavailable on Edge runtime. `hashToken()` is async; all call sites use `await`.
