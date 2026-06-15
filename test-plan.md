# lineup — Test Plan

## Unit Tests

### Token hashing
- **Tests**: Auth model — parent access tokens and API keys stored hashed
- **Setup**: none
- **Action**: Generate a parent access token / API key, hash it
- **Expected**: Stored value is SHA-256 of raw token; raw token never persisted

### Auth context resolution — prefix routing
- **Tests**: Tenancy Implementation — `resolveAuthContext` middleware
- **Setup**: Three tokens: a Supabase JWT, a `pat_...` parent token, a `sk_...` API key
- **Action**: Pass each as `Authorization: Bearer <token>`
- **Expected**: Each resolves to the correct context type (`manager`/`superadmin`, `parent`, `apikey`) with correct `tenantId`

### Attendance status validation
- **Tests**: scope — attendance status is one of three values
- **Setup**: none
- **Action**: PUT attendance with `status: 'maybe'`
- **Expected**: `400` validation error; only `attending`/`not_attending`/`no_response` accepted

### Parent contact info validation
- **Tests**: scope — "at least one of email/phone required"
- **Setup**: none
- **Action**: PATCH `/api/me` with `contactEmail: null, contactPhone: null` when the other is also null
- **Expected**: `400` — request rejected

## Integration Tests

### Team bootstrap is atomic
- **Tests**: Admin Panel — "team creation atomically bootstraps first manager invite"
- **Setup**: Authenticated as superadmin
- **Action**: `POST /api/teams` with valid name/slug; simulate invite-row insert failure
- **Expected**: Team row is rolled back — no orphaned team without a manager invite. On success, response includes both `managerInviteUrl` and `parentJoinUrl`.

### Manager invite acceptance creates scoped auth user
- **Tests**: Auth Model — manager invite acceptance
- **Setup**: Pending `memberships` row with `invite_token`, no `user_id`
- **Action**: `POST /api/invites/:token/accept` with email + 12-char password
- **Expected**: Supabase Auth user created with `app_metadata = { role: 'manager', tenant_id }`; `memberships.user_id` set, `accepted_at` set, `invite_token` cleared. Re-accepting the same token returns `409`.

### Manager invite rejects weak password
- **Tests**: scope — "minimum password length of 10 characters"
- **Action**: `POST /api/invites/:token/accept` with a 6-char password
- **Expected**: `400`, membership row unchanged

### Parent join-link registration
- **Tests**: scope — "anyone with a valid join link can register as a parent, no approval"
- **Setup**: Active team with known `join_token`
- **Action**: `POST /api/join/:joinToken` with parent name, email, and two kids
- **Expected**: `201` with `accessToken` (raw, shown once), `parent` row created with `tenant_id` matching the team, `access_token_hash` set, two `kids` rows created with same `tenant_id` and `parent_id`

### Parent re-registration after lost token
- **Tests**: scope — "parent who lost access token can re-register via join link, creating a new parent record"
- **Setup**: One parent already registered for a team
- **Action**: `POST /api/join/:joinToken` again with the same parent's name/contact
- **Expected**: A second, independent `parents` row is created with a new `access_token`; the original row and its attendance history remain unchanged (no merge)

### Join link regeneration invalidates old link, preserves existing parent tokens
- **Tests**: scope — "regenerating join link invalidates old link; already-registered parents unaffected"
- **Setup**: Team with one registered parent (has valid `access_token`)
- **Action**: Manager calls `POST /api/team/join-link/regenerate`, then `GET /api/join/:oldToken`
- **Expected**: `GET /api/join/:oldToken` returns `404`; the existing parent's `access_token` still authenticates successfully against `/api/me`

### Tenant isolation — sessions
- **Tests**: Tenancy — cross-tenant data access
- **Setup**: Two teams (A, B), each with a manager and at least one session
- **Action**: Manager A calls `GET /api/sessions`
- **Expected**: Response contains only Team A's sessions; Team B's sessions never appear, regardless of date range

### Tenant isolation — API key scoping
- **Tests**: scope — "API key restricted to session create/update/delete only"
- **Setup**: Team A's API key
- **Action**: Using Team A's `sk_...` key, call `GET /api/roster`, `GET /api/announcements`, `POST /api/announcements`
- **Expected**: All return `403` (API key auth not accepted on these routes). `POST /api/sessions` with the same key succeeds and creates a session scoped to Team A.

### API key cannot access another team's sessions
- **Setup**: Team A's API key, Team B has sessions
- **Action**: `GET /api/sessions` using Team A's key
- **Expected**: Only Team A's sessions returned

### Session CRUD by manager
- **Tests**: Admin Panel — manager session management
- **Setup**: Authenticated manager
- **Action**: `POST /api/sessions` → `PATCH /api/sessions/:id` → `DELETE /api/sessions/:id`
- **Expected**: Each step succeeds (200/201); after delete, `GET /api/sessions` no longer includes it, and any `attendance` rows for that session are gone (cascade)

### Kid archiving preserves attendance history
- **Tests**: scope — "removing a kid archives rather than hard-deletes"
- **Setup**: A kid with an `attending` record on a past session and a `no_response` record on a future session
- **Action**: Parent calls `PATCH /api/kids/:id` with `{ archived: true }`, then `GET /api/me`, then `GET /api/sessions` (covering both past and future date ranges)
- **Expected**: `GET /api/me` no longer lists the kid in the active kid list. `GET /api/sessions` for the past session still shows the kid's name with `attending`. `GET /api/sessions` for the future session omits the kid from the `attendance` array (no longer prompted). Un-archiving (`{ archived: false }`) restores it to `GET /api/me` and future attendance prompts.

### Attendance default and update
- **Tests**: scope — "attendance defaults to no_response until parent marks it"
- **Setup**: New session created, team has one parent with two kids
- **Action**: `GET /api/sessions` immediately after creation
- **Expected**: `attendance` array includes both kids with `status: 'no_response'`. Then parent calls `PUT /api/sessions/:id/attendance` for one kid with `status: 'attending'`; subsequent `GET /api/sessions` reflects the update for that kid only.

### Attendance ownership enforcement
- **Tests**: scope — "parent cannot modify another parent's kids/attendance"
- **Setup**: Two parents (P1, P2) on the same team, each with one kid
- **Action**: P1's access token used to `PUT /api/sessions/:id/attendance` with P2's `kidId`
- **Expected**: `403`

### Attendance visible to all parents
- **Tests**: scope — "attendance visible to all parents on the team"
- **Setup**: P1 marks their kid attending
- **Action**: P2 calls `GET /api/sessions`
- **Expected**: P2's response includes P1's kid's name and `attending` status

### Roster does not leak across teams, but does show contact info to managers
- **Tests**: scope — "manager can view roster incl. contact info; parents cannot see other parents' contact info"
- **Setup**: Team with two parents
- **Action**: (a) Manager calls `GET /api/roster`; (b) Parent calls `GET /api/sessions` and `GET /api/announcements`
- **Expected**: (a) returns both parents' `contactEmail`/`contactPhone`; (b) responses never include any parent's contact info — only kid names and attendance status

### Announcement CRUD and authorship snapshot
- **Tests**: Data Model — `announcements.author_name_snapshot`
- **Setup**: Manager M1 posts an announcement, then M1 is removed from the team
- **Action**: `GET /api/announcements`
- **Expected**: Announcement still shows M1's name (snapshot), even though M1 is no longer a manager

### Cannot remove last manager
- **Tests**: scope — "team must always have ≥1 manager"
- **Setup**: Team with exactly one accepted manager
- **Action**: `DELETE /api/team/managers/:membershipId` for that manager
- **Expected**: `409`, membership unchanged

### Deactivated team — manager and parent experience
- **Tests**: scope — "deactivated team shows clear inactive state"
- **Setup**: Superadmin sets team `status: 'inactive'`
- **Action**: (a) Manager calls any `/api/...` endpoint; (b) Parent (existing access token) calls `GET /api/me`; (c) `GET /api/join/:joinToken`
- **Expected**: All return `403` with a body indicating the team is inactive (not a generic error)

### API key regeneration invalidates old key
- **Setup**: Team with an active API key K1
- **Action**: Manager calls `POST /api/team/api-key/regenerate`, then calls `POST /api/sessions` using K1
- **Expected**: New key K2 returned (raw, once); request using K1 returns `401`

### Role-mismatch returns 403, not 401
- **Tests**: scope — "resolved context type must match endpoint's required role(s); mismatch is 403"
- **Setup**: A valid parent access token
- **Action**: `GET /api/roster` (manager-only) using the parent's token
- **Expected**: `403` (auth succeeded — token is valid — but role doesn't permit this route), not `401`

### Deactivated team blocks API-key session writes
- **Tests**: scope — "inactive-team check applies to API-key requests"
- **Setup**: Team with an active API key, then superadmin sets `status: 'inactive'`
- **Action**: `POST /api/sessions` using the team's API key
- **Expected**: `403 { error: { code: 'team_inactive' } }` — session is not created

### Empty announcement body rejected
- **Tests**: scope — "reject empty/whitespace-only announcement bodies"
- **Action**: `POST /api/announcements` with `{ bodyHtml: "<p>   </p>" }`
- **Expected**: `400`, no announcement created

## E2E Tests (Playwright)

### Manager onboarding → session creation → parent sees it
- **Setup**: Superadmin creates a team via `/admin/teams`, gets manager invite URL
- **Action**: Open invite URL → set password → log in → create a session via `/manager/calendar` → open parent join link in a separate session → register as a parent → view `/t/:slug/calendar`
- **Expected**: The session created by the manager appears in the parent's calendar within the default 4-week window, with `no_response` attendance for the registered kid(s)

### Parent marks attendance, visible to second parent
- **Setup**: Team with one session, two parents registered (each with one kid)
- **Action**: Parent 1 marks their kid `attending`; Parent 2 loads the calendar
- **Expected**: Parent 2 sees Parent 1's kid marked `attending` for that session, without seeing Parent 1's contact info anywhere in the UI

### Announcement feed
- **Setup**: Logged-in manager
- **Action**: Post a rich-text announcement from `/manager/announcements`; load `/t/:slug/announcements` as a parent
- **Expected**: Announcement appears with correct author name and timestamp, rendered HTML intact, no edit/delete controls visible to the parent

### Calendar pagination/scroll beyond 4 weeks
- **Setup**: Team with sessions spanning 8 weeks out
- **Action**: Parent loads `/t/:slug/calendar`, scrolls/paginates forward
- **Expected**: Initial view shows only the next 4 weeks; sessions in weeks 5–8 load on scroll/pagination, not on initial load

### Claude-driven bulk session creation via API key
- **Setup**: Manager generates an API key from `/manager/team`
- **Action**: `POST /api/sessions` x N using the API key (simulating Claude bulk-creating a season schedule)
- **Expected**: All sessions appear in both `/manager/calendar` and `/t/:slug/calendar`; attempting `GET /api/roster` with the same key fails with `403`
