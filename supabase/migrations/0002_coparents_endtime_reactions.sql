-- 0002_coparents_endtime_reactions.sql
-- Adds:
--   • families — grouping entity so co-parents share kids
--   • parents.family_id — nullable FK to families
--   • parents.supabase_user_id — nullable, set on join when email provided
--   • parent_sessions — multi-device token table (so magic-link login doesn't
--     invalidate existing browser sessions)
--   • co_parent_invites — invite tokens for adding a second parent to a family
--   • sessions.end_time — nullable wall-clock end time alongside existing time
--   • announcement_reactions — per-parent emoji reactions on announcements

-- ─── Families ────────────────────────────────────────────────────────────────
-- A family is just a grouping entity. Parents with the same family_id can
-- manage each other's kids for attendance purposes.

create table families (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table families enable row level security;

create policy superadmin_all on families
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_read_own on families
  for select using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

create index families_tenant_id_idx on families(tenant_id);

-- ─── Extend parents ──────────────────────────────────────────────────────────

alter table parents
  add column family_id uuid references families(id),
  add column supabase_user_id uuid;

create index parents_family_id_idx on parents(family_id);
create unique index parents_supabase_user_id_idx on parents(supabase_user_id)
  where supabase_user_id is not null;

-- ─── Parent sessions (multi-device tokens) ───────────────────────────────────
-- Each magic-link login issues a new token stored here. Original join token
-- remains in parents.access_token_hash. Auth middleware checks both.

create table parent_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  parent_id   uuid not null references parents(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now()
);

alter table parent_sessions enable row level security;

create policy superadmin_all on parent_sessions
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create index parent_sessions_parent_id_idx on parent_sessions(parent_id);

-- ─── Co-parent invites ───────────────────────────────────────────────────────
-- Created by a manager (from admin app) or by a parent (from web app).
-- Accepting the invite creates a new parent row in the same family.

create table co_parent_invites (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  family_id       uuid not null references families(id) on delete cascade,
  invite_token    text not null unique,
  invited_by_parent_id  uuid references parents(id),  -- null if manager-initiated
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);

alter table co_parent_invites enable row level security;

create policy superadmin_all on co_parent_invites
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_read_own on co_parent_invites
  for select using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

create index co_parent_invites_tenant_id_idx on co_parent_invites(tenant_id);

-- ─── Session end time ─────────────────────────────────────────────────────────
-- Nullable — existing sessions without end_time still display correctly.

alter table sessions add column end_time time;

-- ─── Announcement reactions ───────────────────────────────────────────────────
-- One row per (announcement, parent, emoji). Parents toggle reactions.

create table announcement_reactions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  announcement_id  uuid not null references announcements(id) on delete cascade,
  parent_id        uuid not null references parents(id) on delete cascade,
  emoji            text not null,
  created_at       timestamptz not null default now(),
  unique (announcement_id, parent_id, emoji)
);

alter table announcement_reactions enable row level security;

create policy superadmin_all on announcement_reactions
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_read_own on announcement_reactions
  for select using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

create index announcement_reactions_announcement_id_idx on announcement_reactions(announcement_id);
