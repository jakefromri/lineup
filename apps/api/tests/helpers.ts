import { createClient } from '@supabase/supabase-js';
import { randomUUID, createHash } from 'crypto';

export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
export const API_URL = process.env.API_URL ?? 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY env vars. ' +
      'Integration tests need a real (dev) Supabase project — see apps/api/.env.example.',
  );
}

// Service-role client — direct DB access for seeding/cleanup, bypasses RLS.
export const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client — used only to sign in seeded users and obtain real JWTs.
export const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const TEST_PASSWORD = 'integration-test-password-1234';

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/** Thin fetch wrapper against the live API server (see CLAUDE.md: API must be running on :3000). */
export async function api<T = any>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T };
}

// ─── Test data tracking / cleanup ────────────────────────────────────────────

const createdTenantIds = new Set<string>();
const createdUserIds = new Set<string>();

export function trackTenant(id: string): void {
  createdTenantIds.add(id);
}

export function trackUser(id: string): void {
  createdUserIds.add(id);
}

/**
 * Deletes everything created by this test file. Tenant deletion cascades to
 * memberships, parents, kids, sessions, attendance, announcements, api_keys
 * (all have `tenant_id ... on delete cascade`). Auth users are deleted
 * separately — must happen AFTER tenant deletion since
 * `announcements.author_user_id` references `auth.users(id)` without cascade.
 */
export async function cleanupAll(): Promise<void> {
  for (const id of createdTenantIds) {
    await admin.from('tenants').delete().eq('id', id);
  }
  createdTenantIds.clear();

  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
  createdUserIds.clear();
}

function randomSlug(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function createTenant(opts: { name?: string; status?: 'active' | 'inactive' } = {}) {
  const slug = randomSlug('test-team');
  const joinToken = randomUUID().replace(/-/g, '');

  const { data, error } = await admin
    .from('tenants')
    .insert({
      name: opts.name ?? 'Test Team',
      slug,
      join_token: joinToken,
      status: opts.status ?? 'active',
    })
    .select('id, name, slug, join_token, status')
    .single();

  if (error || !data) throw error ?? new Error('failed to create tenant');
  trackTenant(data.id);
  return data;
}

/** Creates a Supabase Auth user with `app_metadata = { role: 'superadmin' }` and returns a JWT. */
export async function createSuperadmin() {
  const email = `superadmin-${randomUUID()}@example.com`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'superadmin' },
  });
  if (error || !data.user) throw error ?? new Error('failed to create superadmin user');
  trackUser(data.user.id);

  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError || !session.session) throw signInError ?? new Error('failed to sign in superadmin');

  return { userId: data.user.id, email, token: session.session.access_token };
}

/** Creates a Supabase Auth user + accepted membership for the given tenant, and returns a JWT. */
export async function createManager(tenantId: string) {
  const email = `manager-${randomUUID()}@example.com`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'manager', tenant_id: tenantId },
  });
  if (error || !data.user) throw error ?? new Error('failed to create manager user');
  trackUser(data.user.id);

  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .insert({
      tenant_id: tenantId,
      user_id: data.user.id,
      role: 'manager',
      accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (membershipError || !membership) throw membershipError ?? new Error('failed to create membership');

  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError || !session.session) throw signInError ?? new Error('failed to sign in manager');

  return { userId: data.user.id, email, membershipId: membership.id, token: session.session.access_token };
}

/** Registers a parent via the public join endpoint, returning the raw `pat_...` access token. */
export async function registerParent(
  joinToken: string,
  body: { parentName: string; contactEmail?: string; contactPhone?: string; kids: { name: string }[] },
) {
  return api<{ accessToken: string; parent: { id: string; name: string }; kids: { id: string; name: string }[] }>(
    `/api/join/${joinToken}`,
    { method: 'POST', body },
  );
}

/** Directly seeds an active API key for a tenant, returning the raw `sk_...` key. */
export async function createApiKey(tenantId: string): Promise<string> {
  const rawKey = `sk_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
  const hash = createHash('sha256').update(rawKey).digest('hex');

  const { error } = await admin
    .from('api_keys')
    .upsert(
      { tenant_id: tenantId, key_hash: hash, created_at: new Date().toISOString(), revoked_at: null },
      { onConflict: 'tenant_id' },
    );
  if (error) throw error;

  return rawKey;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
