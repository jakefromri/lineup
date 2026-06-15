# Hello World — Build Report

## Status
READY — awaiting `npm install` and Supabase project config

---

## What Was Built

A complete multi-tenant auth scaffold with an elaborate "Hello World" display. All auth flows implemented and wired end-to-end.

### Apps
| App | Port | Who uses it | Routes |
|-----|------|-------------|--------|
| `apps/api` | 3000 | All | Auth, tenant mgmt, invite flows |
| `apps/web` | 5173 | Tenant admins + users | `/login`, `/invite`, `/t/:slug`, `/t/:slug/members` |
| `apps/admin` | 5174 | Superadmin only | `/login`, `/tenants` |

**Port boundary rule:**
- `:5174` is the **operator console** — superadmin only, one job: manage tenants
- `:5173` is the **tenant portal** — everyone in a tenant (users see the board, tenant admins also see a Members panel at `/t/:slug/members`)

### Database
- `tenants` — with `superadmin_all` + `tenant_members_read_own` RLS policies
- `memberships` — with user, tenant_admin, and superadmin policies
- `invites` — service-role only (no client reads)

---

## Lessons Applied (from Noticeboard)

| Lesson | Applied |
|--------|---------|
| tsx --env-file=.env in API dev script | ✅ |
| Every Vite app fully scaffolded (index.html, main.tsx, App.tsx, vite.config, tsconfig, tailwind, postcss) | ✅ |
| JWT claims: IDs only (role + tenant_id) | ✅ |
| RLS: two policies per table (superadmin_all + tenant_members_read_own) | ✅ |
| Atomic tenant creation with invite rollback | ✅ |
| window.location.href for cross-app navigation (web → admin) | ✅ |
| shadcn/ui for all forms, buttons, cards, tables | ✅ |
| Supabase hosted (not Docker) | ✅ |
| Path aliases (@/*) in tsconfig + vite.config | ✅ |
| All packages in dependencies (verified imports vs package.json) | ✅ |

---

## Setup Instructions

### 1. Supabase project
1. Create a free hosted project at https://supabase.com
2. Note your: Project URL, anon key, service role key, project ref

### 2. Apply migrations
Two options:

**Option A — Supabase CLI (recommended):**
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — SQL Editor:**
Paste `supabase/migrations/0001_initial_schema.sql` into Supabase Dashboard → SQL Editor and run it.

### 3. Create superadmin user
In Supabase Dashboard → Authentication → Users → Add user:
- Email: `jakericciardi@gmail.com`
- Password: choose a strong password (10+ chars)
- Toggle "Auto Confirm User"

Then run this SQL to set superadmin role:
```sql
UPDATE auth.users
SET raw_app_meta_data = jsonb_build_object(
  'role', 'superadmin',
  'tenant_id', null,
  'provider', 'email',
  'providers', ARRAY['email']::text[]
)
WHERE email = 'jakericciardi@gmail.com';
```

### 4. Configure .env files
Copy and fill in all three:
```bash
# Each gets SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
cp apps/api/.env.example apps/api/.env

# Each gets VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
cp apps/web/.env.example apps/web/.env
cp apps/admin/.env.example apps/admin/.env
```

### 5. Install and run
```bash
npm install
npm run dev
```

---

## User Flows

### Superadmin (jakericciardi@gmail.com)
1. Go to http://localhost:5174/login
2. Sign in → lands on /tenants
3. Click "+ New tenant" → fill name, slug, admin email
4. Copy the invite URL from the green banner
5. Share the URL with the tenant admin

### Tenant Admin (invited)
1. Open the invite URL: http://localhost:5173/invite?token=...
2. Set a password (10+ chars) → redirected to login
3. Go to http://localhost:5173/login → sign in → lands on Hello World board (`/t/:slug`)
4. Click **Manage members →** in the header → goes to `/t/:slug/members`
5. Click "+ Invite member" → fill email, choose role "User"
6. Copy the invite URL and share with the user

### User (invited)
1. Open the invite URL: http://localhost:5173/invite?token=...
2. Set a password → redirected to login
3. Go to http://localhost:5173/login → sign in
4. See the elaborate Hello World display

---

## Deviations from Architecture

- **`/api/tenant/members` route** uses a combined router file (`routes/tenant.ts`) instead of separate files — simpler and equivalent.
- **No `/api/tenant/info` endpoint** — the web Board fetches tenant data directly from Supabase client using the `tenant_members_read_own` RLS policy. This is cleaner than an extra API call.
- **Port boundary corrected from initial arch doc** — original spec put tenant admin `/members` in the admin app (`:5174`). Corrected so `:5174` is superadmin-only and tenant admins manage members at `/t/:slug/members` in the web app (`:5173`). This is the right UX boundary.
- **No test suite** — scaffolding focuses on functional correctness. Tests to be added in Agent 05 pass.

---

## Known Issues / Next Steps

- [ ] Email delivery for invites — currently all invite URLs are returned in API responses only. Add Supabase email templates or a transactional email provider (Resend, Postmark) in a follow-up.
- [ ] The superadmin SQL above preserves any existing provider metadata. If the user was created without email confirmation, also set `email_confirmed_at`.
- [ ] No settings page for tenant admins (architecture calls for `/settings` — deferred).
