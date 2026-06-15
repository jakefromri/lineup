# lineup — team training schedule manager

**Status:** idea
**Working name:** `lineup` (placeholder — rename if something better comes up)

## concept

A simple web app for managing a team's training schedule and sharing it with parents. Built multi-tenant from day one so it could eventually support multiple teams/orgs each running their own setup, but v1 is scoped to one team (mine).

Mobile-first — most usage will be parents checking the schedule on their phones.

## core users

- **Manager** — creates the team, adds sessions, posts announcements, manages other managers
- **Co-manager** — same permissions as manager, added by an existing manager
- **Parent** — accesses via shared link, registers their kid(s) + contact info, views schedule, marks attendance, reads announcements

No login/account creation required for parents — access is via a shareable team link (token-based).

## v1 feature scope

### 1. team setup
- Manager creates a team (name, basic details)
- Generates a shareable link/code for parents to join

### 2. parent onboarding via link
- Parent opens link, adds their kid's name + their own contact info (name, email/phone)
- No verification step required for v1 — link possession = access
- Multiple kids per parent supported

### 3. training sessions / calendar
- Each session has: name, date, time, location
- Parents see a calendar view of upcoming sessions (next several weeks/months)
- Sessions are tenant-scoped (only visible to that team)

### 4. attendance notes
- For each session, parents can mark their kid(s) as attending / not attending
- Simple per-kid, per-session status — no approval workflow

### 5. manager roles
- Original manager can add other users as managers (co-managers)
- All managers have equal permissions (create sessions, post announcements, manage roster)

### 6. announcement feed
- Simple rich-text posts, no threading/comments
- Each post shows author + timestamp
- Visible to all parents on the team page

### 7. API + auth key
- Each team gets an API key for programmatic access
- Goal: manager can hand a file/calendar to Claude and have Claude call the API to bulk-create/update training sessions
- Scope for v1: create/update/delete sessions via API (same data model as manual entry)

## explicitly out of scope for v1

- Email or SMS/push notifications (no reminders, no digest emails)
- Parent accounts / authentication beyond the shared link
- Threaded comments or replies on announcements
- Approval workflows for attendance changes

## multi-tenant notes

- Data model should be tenant-scoped from the start (team_id on sessions, members, announcements, etc.) even though v1 only needs one team
- Shared parent-access links should be scoped to a single team (token maps to team_id)
- Follow patterns from `noticeboard` where applicable (RLS policies, invite-link pattern, announcement feed shape — noticeboard already has a similar "rich text, timestamped, no threading" announcement feature worth reusing/adapting)
- **Also check `meridian`** for improvements made on top of the `hello-world`/ComposableAuth scaffold's multi-tenant setup. Relevant pieces for lineup: RLS helper functions that extract JWT `app_metadata` claims (e.g. `meridian_tenant_id()`-style helpers), atomic invite-acceptance flow (lock invite row → create auth user → insert membership → rollback on failure), and atomic tenant bootstrapping (create team + first manager invite in one call, return invite URL). Meridian's cross-tenant identity model (companies/agencies/candidates linked to many tenants via junction tables) is likely overkill for lineup's single-team-per-parent model, but worth a skim in case parents-with-kids-on-multiple-teams becomes a real need later.

## decisions

- **Manager auth**: Supabase Auth, following the pattern from `world-cup-starting-11` — email/password sign-up with optional magic link sign-in (`signInWithOtp` + PKCE callback flow). Unlike that project's hardcoded admin-email allowlist, manager access here needs to support multiple/dynamic managers per team, so role is determined via a `team_managers` table (user_id + team_id), consistent with CLAUDE.md's tenant pattern (role + tenant_id, IDs only — no display data in JWT `app_metadata`).
- **Calendar view**: defaults to 4 weeks out. Either infinite scroll or simple pagination (week/month forward-back) — implementation detail to decide during build.
- **Attendance visibility**: visible to all parents on the team (not just managers) — helps parents coordinate carpools etc.
- **Stack**: confirmed — Vite + React + TypeScript + shadcn/ui + Supabase (auth + RLS) + Vercel, consistent with other skunkworks projects.

## next steps

This project involves real architecture decisions (multi-tenant data model, RLS, Supabase auth, manager roles), so per CLAUDE.md it goes through the **Ralph Loop** rather than the informal "momentum" checklist — no repo/Supabase/Vercel setup yet.

Next step: kick off **Agent 01 (Scope)** from `/skunkworks/_ralph-loop/`, using this idea.md as input, with pointers to:
- `world-cup-starting-11` for the manager auth/login pattern (`Login.tsx`, `AuthCallback.tsx`, `useAuth.ts` — email/password + magic link, adapted for multi-manager `team_managers` lookup instead of hardcoded admin emails)
- `meridian` for improved multi-tenant/RLS/invite patterns on top of the `hello-world` scaffold
- `noticeboard` for the announcement feed and invite-link shape
