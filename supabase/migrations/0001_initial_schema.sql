-- 0001_initial_schema.sql
-- lineup — initial schema
-- Multi-tenant team training schedule manager: tenants, memberships, parents,
-- kids, sessions, attendance, announcements, api_keys

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─── Tenants ─────────────────────────────────────────────────────────────────

create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  join_token  text not null unique,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now()
);

alter table tenants enable row level security;

-- Superadmin: full access
create policy superadmin_all on tenants
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

-- Managers: read only their own tenant (required for login redirect)
create policy tenant_members_read_own on tenants
  for select using (
    id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

-- ─── Memberships ─────────────────────────────────────────────────────────────
-- Covers both pending manager invites (user_id null, invite_token set) and
-- accepted managers (user_id set, accepted_at set, invite_token cleared).

create table memberships (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,
  role          text not null default 'manager' check (role in ('manager')),
  invite_token  text unique,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz
);

alter table memberships enable row level security;

-- Superadmin: full access
create policy superadmin_all on memberships
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

-- Managers: full CRUD on their own tenant's memberships
create policy tenant_managers_all_own on memberships
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  )
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

-- A user can read their own membership row (needed for login redirect to
-- resolve tenant_id before app_metadata is necessarily fresh)
create policy self_read on memberships
  for select using (user_id = auth.uid());

-- Note: "team must always have >=1 accepted manager" is enforced in the API,
-- not the DB.

-- ─── Parents ─────────────────────────────────────────────────────────────────
-- Parents are not Supabase Auth users. Identified via access_token_hash.
-- Note: "at least one of contact_email/contact_phone required" is enforced in
-- the API, not as a DB constraint.

create table parents (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  name                text not null,
  contact_email       text,
  contact_phone       text,
  access_token_hash   text not null unique,
  created_at          timestamptz not null default now()
);

alter table parents enable row level security;

-- Superadmin: full access
create policy superadmin_all on parents
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

-- Managers: read their own tenant's parents (roster view, includes contact info)
create policy tenant_managers_read_own on parents
  for select using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

-- No RLS path for parents themselves — parent-scoped requests go through
-- the API using the service role, after resolving access_token_hash.

-- ─── Kids ────────────────────────────────────────────────────────────────────

create table kids (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  parent_id     uuid not null references parents(id) on delete cascade,
  name          text not null,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

alter table kids enable row level security;

create policy superadmin_all on kids
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_read_own on kids
  for select using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

create index kids_parent_id_idx on kids(parent_id);
create index kids_tenant_id_idx on kids(tenant_id);

-- ─── Sessions ────────────────────────────────────────────────────────────────
-- date/time are stored and rendered as local wall-clock values — no UTC
-- conversion (single-location-team assumption for v1).

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  date          date not null,
  time          time not null,
  location      text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table sessions enable row level security;

create policy superadmin_all on sessions
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_all_own on sessions
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  )
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

create index sessions_tenant_id_date_idx on sessions(tenant_id, date);

-- ─── Attendance ──────────────────────────────────────────────────────────────

create table attendance (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  session_id    uuid not null references sessions(id) on delete cascade,
  kid_id        uuid not null references kids(id) on delete cascade,
  status        text not null default 'no_response' check (status in ('attending', 'not_attending', 'no_response')),
  updated_at    timestamptz not null default now(),
  unique (session_id, kid_id)
);

alter table attendance enable row level security;

create policy superadmin_all on attendance
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_all_own on attendance
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  )
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

create index attendance_session_id_idx on attendance(session_id);
create index attendance_kid_id_idx on attendance(kid_id);

-- ─── Announcements ───────────────────────────────────────────────────────────

create table announcements (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,
  author_user_id          uuid not null references auth.users(id),
  author_name_snapshot    text not null,
  body_html               text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table announcements enable row level security;

create policy superadmin_all on announcements
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_all_own on announcements
  using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  )
  with check (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );

create index announcements_tenant_id_created_at_idx on announcements(tenant_id, created_at desc);

-- ─── API Keys ────────────────────────────────────────────────────────────────
-- One active key per team. The API never returns key_hash — only
-- exists/created_at/revoked_at. If direct-from-client Supabase access to this
-- table is ever introduced, it must go through a view that excludes key_hash.

create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null unique references tenants(id) on delete cascade,
  key_hash      text not null unique,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

alter table api_keys enable row level security;

create policy superadmin_all on api_keys
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'superadmin');

create policy tenant_managers_read_own on api_keys
  for select using (
    tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'manager'
  );
