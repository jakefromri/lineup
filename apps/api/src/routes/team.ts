import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator } from '../lib/validation.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';
import { resolveTenantId } from '../lib/context.js';

const app = new Hono();

app.use('*', resolveAuthContext, requireContext('manager', 'superadmin'));

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';
const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5174';

// ─── GET /api/team ────────────────────────────────────────────────────────────
// Auth: manager or superadmin (superadmin must pass X-Tenant-Id header)

app.get('/', async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, status, join_token')
    .eq('id', tenantId)
    .single();

  if (tenantError || !tenant) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Team not found');
  }

  const { data: apiKey } = await supabaseAdmin
    .from('api_keys')
    .select('created_at, revoked_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const { data: memberships } = await supabaseAdmin
    .from('memberships')
    .select('id, user_id, accepted_at')
    .eq('tenant_id', tenantId)
    .order('invited_at');

  const managers = await Promise.all(
    (memberships ?? []).map(async (m) => {
      let email: string | null = null;
      if (m.user_id) {
        const { data } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        email = data.user?.email ?? null;
      }
      return { id: m.id, email, acceptedAt: m.accepted_at };
    }),
  );

  return c.json({
    team: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      parentJoinUrl: `${WEB_URL}/join/${tenant.join_token}`,
    },
    apiKey: {
      exists: Boolean(apiKey && !apiKey.revoked_at),
      createdAt: apiKey?.created_at ?? undefined,
      revokedAt: apiKey?.revoked_at ?? undefined,
    },
    managers,
  });
});

// ─── PATCH /api/team ──────────────────────────────────────────────────────────
// Auth: manager or superadmin

const updateTeamSchema = z.object({
  name: z.string().min(1, 'name is required'),
});

app.patch('/', jsonValidator(updateTeamSchema), async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));
  const body = c.req.valid('json');

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .update({ name: body.name })
    .eq('id', tenantId)
    .select('id, name, slug, status, join_token')
    .single();

  if (error || !tenant) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to update team');
  }

  return c.json({
    team: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      parentJoinUrl: `${WEB_URL}/join/${tenant.join_token}`,
    },
  });
});

// ─── POST /api/team/join-link/regenerate ─────────────────────────────────────
// Auth: manager or superadmin

app.post('/join-link/regenerate', async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));

  const joinToken = generateToken('');

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .update({ join_token: joinToken })
    .eq('id', tenantId)
    .select('join_token')
    .single();

  if (error || !tenant) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to regenerate join link');
  }

  return c.json({ parentJoinUrl: `${WEB_URL}/join/${tenant.join_token}` });
});

// ─── POST /api/team/api-key/regenerate ───────────────────────────────────────
// Auth: manager or superadmin

app.post('/api-key/regenerate', async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));

  const apiKey = generateToken('sk_');
  const keyHash = await hashToken(apiKey);

  const { error } = await supabaseAdmin.from('api_keys').upsert(
    {
      tenant_id: tenantId,
      key_hash: keyHash,
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'tenant_id' },
  );

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to regenerate API key');
  }

  return c.json({ apiKey });
});

// ─── POST /api/team/managers/invite ──────────────────────────────────────────
// Auth: manager or superadmin

app.post('/managers/invite', async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));

  const inviteToken = generateToken('');

  const { error } = await supabaseAdmin.from('memberships').insert({
    tenant_id: tenantId,
    role: 'manager',
    invite_token: inviteToken,
  });

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create invite');
  }

  return c.json({ inviteUrl: `${ADMIN_URL}/accept-invite/${inviteToken}` });
});

// ─── DELETE /api/team/managers/:membershipId ─────────────────────────────────
// Auth: manager or superadmin

app.delete('/managers/:membershipId', async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));
  const membershipId = c.req.param('membershipId');

  const { data: membership } = await supabaseAdmin
    .from('memberships')
    .select('id, tenant_id, accepted_at')
    .eq('id', membershipId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!membership) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Manager not found');
  }

  if (membership.accepted_at) {
    const { count } = await supabaseAdmin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('accepted_at', 'is', null);

    if ((count ?? 0) <= 1) {
      throw apiError(409, ErrorCode.CONFLICT, 'A team must have at least one manager');
    }
  }

  const { error } = await supabaseAdmin.from('memberships').delete().eq('id', membershipId);
  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to remove manager');
  }

  return c.json({ success: true });
});

export default app;
