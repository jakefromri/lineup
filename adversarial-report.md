# lineup — Adversarial Review

## Summary
8 issues found: 3 High, 5 Medium, 4 Low.
8 issues resolved in `scope.md`, 4 Low items left for user awareness/decision (no scope.md changes).

## Issues

### [ISSUE-001] API key read access to sessions is contradicted between architecture sections — HIGH
**Category**: Scope / Tests
**Found in**: architecture.md §API Endpoints (Sessions) and §test-plan.md ("Tenant isolation — API key scoping")
**Issue**: The "Sessions" section header implies API keys can call all session endpoints, but the `GET /api/sessions` spec itself only lists `Auth: manager or parent` — omitting `apikey`. The test plan, however, asserts `GET /api/sessions` works with an API key. This is an unresolved contradiction that would cause Agent 04 to guess.
**Resolution**: Added explicit behavior to `scope.md` — the API key has full read/write access to session resources (`GET`/`POST`/`PATCH`/`DELETE`) and no access to anything else. Agent 02 pass 2 should update the `GET /api/sessions` endpoint spec to include `apikey` as a valid auth context.

### [ISSUE-002] Superadmin "view team roster/sessions read-only" has no API surface — HIGH
**Category**: Scope creep / Admin panel
**Found in**: scope.md §Admin Panel (Superadmin capabilities) vs. architecture.md §API Endpoints
**Issue**: scope.md listed this as a superadmin capability, but architecture.md defines no endpoint for it — an unimplemented promise that would either get skipped silently or cause Agent 04 to invent ad-hoc endpoints.
**Resolution**: Removed from MVP scope and moved to "Out of Scope (MVP)" with rationale (v1 has one team, and Jake is also that team's manager, so a separate superadmin roster view is redundant). Revisit when multiple teams exist.

### [ISSUE-003] Kid deletion cascades attendance, contradicting "all history remains visible" — HIGH
**Category**: Scope gap / data integrity
**Found in**: architecture.md `DELETE /api/kids/:id` ("cascades to that kid's attendance rows") vs. scope.md "The system will NOT... auto-expire or archive... all history remains visible"
**Issue**: If a parent removes a kid added by mistake (or a kid who leaves the team), hard-deleting their attendance rows erases history that managers and other parents may still want to see (e.g., "who came to last week's practice").
**Resolution**: Added explicit behavior to `scope.md` — removing a kid **archives** it rather than hard-deleting. Archived kids are hidden from the parent's active list and future attendance prompts, but historical attendance records (with the kid's name) remain visible. Agent 02 pass 2 should add an `archived_at` column to `kids` and change the endpoint from `DELETE` to an archive action (e.g., `PATCH /api/kids/:id` with `{ archived: true }`).

### [ISSUE-004] No explicit rule for role-mismatch on authenticated requests — MEDIUM
**Category**: Auth and permissions gap
**Found in**: architecture.md §Tenancy Implementation (auth middleware described, but route-level enforcement of *which* context types are valid per route is implicit)
**Issue**: E.g., what happens if a valid parent access token is sent to `GET /api/roster` (manager-only)? The middleware would resolve a valid `parent` context, but the route requires `manager`. Without an explicit rule, this could be implemented inconsistently (401 vs 403 vs silently scoped wrong).
**Resolution**: Added explicit behavior to `scope.md` — every endpoint validates the resolved context type against its required role(s); a mismatch returns `403` (auth succeeded, but the role is wrong — distinct from `401` for missing/invalid credentials).

### [ISSUE-005] Deactivated team status not enforced for API-key requests — MEDIUM
**Category**: Tenancy gap
**Found in**: scope.md "Show a clear 'team is no longer active' state to managers and parents..." — API keys not mentioned
**Issue**: If a team is deactivated, an existing API key could still create/modify sessions (e.g., Claude continuing to push schedule updates) unless explicitly blocked.
**Resolution**: Added to `scope.md` — the inactive-team check applies to API-key requests too; a deactivated team's API key returns the inactive-team error rather than operating normally.

### [ISSUE-006] No validation on announcement body content — MEDIUM
**Category**: Scope gap
**Found in**: scope.md (no mention); architecture.md `POST /api/announcements` request shape (`bodyHtml: string`, no constraint noted)
**Issue**: Following the noticeboard precedent ("Allow empty announcement titles or bodies" was explicitly disallowed there), lineup's scope said nothing about empty announcements — an oversight that could let managers post blank announcements.
**Resolution**: Added to `scope.md` — reject create/edit requests with an empty or whitespace-only body.

### [ISSUE-007] No timezone/wall-clock definition for session date/time — MEDIUM
**Category**: Scope gap
**Found in**: architecture.md `sessions.date` (date) / `sessions.time` (time) — no timezone semantics specified
**Issue**: Without an explicit rule, Agent 04 could store/interpret times in UTC and convert on display, which would shift times incorrectly for users and break the "what time is practice" use case if the team and any future viewers are in different timezones (or during DST transitions).
**Resolution**: Added to `scope.md` — session date/time are stored and displayed as local wall-clock values with no timezone conversion (single-location-team assumption for v1).

### [ISSUE-008] `api_keys.key_hash` could leak via RLS if direct client access is ever added — MEDIUM
**Category**: Tenancy / Auth gap (forward-looking)
**Found in**: architecture.md `api_keys` RLS policy `tenant_managers_read_own` — Postgres RLS is row-level, not column-level, so a `SELECT` policy on `api_keys` would expose `key_hash` to any manager who queries the table directly, even though the API layer never returns it.
**Issue**: Currently the API uses the service role exclusively, so this isn't exploitable today — but it's exactly the kind of latent issue that gets baked in and forgotten until someone adds a "convenience" direct Supabase read from the frontend.
**Resolution**: Added to `scope.md` ("will NOT" list) — `key_hash` must never be exposed to any client; if direct client access to `api_keys` is ever added, it must go through a view excluding `key_hash`. Agent 02 pass 2 should reflect this in the RLS section (e.g., note the view requirement directly in the table's RLS notes).

---

### [ISSUE-009] No manager hierarchy — any manager can remove all co-managers — LOW
**Category**: Auth and permissions
**Found in**: scope.md "Allow any manager to invite, view, and remove other managers (no manager hierarchy)"
**Issue**: A manager could remove every other manager, leaving themselves in sole control of the team. No ownership/founder concept exists to prevent this.
**Resolution**: Left as-is — added an "accepted risk" note to scope.md's Open Questions. Acceptable for v1 given managers are a small, personally-vetted group. Revisit only if this becomes a real problem.

### [ISSUE-010] Duplicate parent records from re-registration are never reconciled — LOW
**Category**: Scope gap
**Found in**: scope.md "Allow a parent who has lost their access token to re-register... no merge in v1"
**Issue**: Over a season, lost-token re-registrations could produce several "ghost" parent records per family, cluttering the roster and splitting attendance history across records for the same kid (if the kid is re-added under the new parent record with a different `kid_id`).
**Resolution**: Left as explicit out-of-scope (already stated). Noted for the user: if this becomes annoying in practice, a lightweight fix would be a manager-facing "merge parents" action in a future iteration — not needed for MVP with one team.

### [ISSUE-011] No rate limiting on join-link registration — LOW
**Category**: Tenancy / abuse
**Found in**: scope.md (no mention)
**Issue**: Anyone with the join link (which could be forwarded indefinitely) can create unlimited parent/kid records with no throttling.
**Resolution**: Added to "Out of Scope (MVP)" explicitly as an accepted limitation — reasonable for a privately-shared link to one team's parent group. Revisit if the join link is ever made more widely shareable (e.g., multi-team self-service).

### [ISSUE-012] No limit on kids-per-parent or sessions-per-team — LOW
**Category**: Scope gap
**Found in**: scope.md Open Questions (already flagged as TBD)
**Issue**: Same as above — theoretically unbounded growth, practically irrelevant for one team.
**Resolution**: Left as TBD in scope.md, as originally noted. No change needed for MVP.

---

## Linear status
Per `_ralph-loop/agents/03-adversarial.md`: both the Agent 02 (pass 1) and this Agent 03 pass are now complete, with one more architecture pass (02, pass 2) needed to incorporate the High/Medium resolutions above before the issue is "Todo"/build-ready. **Note**: no Linear issue has been created for this project yet (Agent 01 normally creates one) — flagging for follow-up; recommend creating a `Foxricciardi` team issue "New project: lineup" before Agent 04 starts, so build progress can be tracked per CLAUDE.md conventions.
