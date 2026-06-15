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
4. Create the superadmin user (`jakericciardi@gmail.com`)
5. Run `npm install`

See `architecture.md`'s "Environment Variables" section for what each app needs if you'd
rather set env vars by hand.

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

## Project docs

- `idea.md` — original concept
- `scope.md` — MVP scope, roles, tenancy model, explicit behaviors
- `architecture.md` — full data model, RLS policies, API routes, env vars
- `test-plan.md` — integration + e2e test scenarios
- `build-report.md` — build notes from the implementation pass

## Deployment

Follows Jake's standard three-environment workflow (local → dev → prod) — see
`/Users/jakericciardi/brian/CLAUDE.md` and `/skunkworks/_ralph-loop/ENVIRONMENT_MANAGEMENT.md`
for branch strategy, PR rules, and the full deploy sequence.
