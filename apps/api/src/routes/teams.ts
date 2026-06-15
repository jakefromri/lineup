import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { generateToken } from '../lib/tokens.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator } from '../lib/validation.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';

const app = new Hono();

app.use('*', resolveAuthContext, requireContext('superadmin'));

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5174';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

// ─── POST /api/teams ──────────────────────────────────────────────────────────
// Auth: superadmin
// Atomically creates the team + first manager invite. A team with no manager
// invite is not a valid state — if the invite insert fails, the team row is
// rolled back.

const createTeamSchema = z.object({
  name: z.string().min(1, 'name is required'),
  slug: z
    .string()
    .min(1, 'slug is required')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase alphanumeric with hyphens'),
});

app.post('/', jsonValidator(createTeamSchema), async (c) => {
  const body = c.req.valid('json');

  const { data: existing } = await supabaseAdmin.from('tenants').select('id').eq('slug', body.slug).maybeSingle();
  if (existing) {
    throw apiError(409, ErrorCode.CONFLICT, 'A team with this slug already exists');
  }

  const joinToken = generateToken('');

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({ name: body.name, slug: body.slug, join_token: joinToken })
    .select('id, name, slug, join_token, status')
    .single();

  if (tenantError || !tenant) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create team');
  }

  const inviteToken = generateToken('');

  const { error: membershipError } = await supabaseAdmin.from('memberships').insert({
    tenant_id: tenant.id,
    role: 'manager',
    invite_token: inviteToken,
  });

  if (membershipError) {
    // Roll back the team — a team with no manager invite is not a valid state.
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id);
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create initial manager invite');
  }

  return c.json(
    {
      team: { id: tenant.id, name: tenant.name, slug: tenant.slug, joinToken: tenant.join_token },
      managerInviteUrl: `${ADMIN_URL}/accept-invite/${inviteToken}`,
      parentJoinUrl: `${WEB_URL}/join/${tenant.join_token}`,
    },
    201,
  );
});

// ─── GET /api/teams ───────────────────────────────────────────────────────────
// Auth: superadmin

app.get('/', async (c) => {
  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, status')
    .order('name');

  if (error || !tenants) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to load teams');
  }

  const tenantIds = tenants.map((t) => t.id);

  const [{ data: memberships }, { data: parents }] = await Promise.all([
    supabaseAdmin.from('memberships').select('tenant_id, accepted_at').in('tenant_id', tenantIds),
    supabaseAdmin.from('parents').select('tenant_id').in('tenant_id', tenantIds),
  ]);

  const managerCounts = new Map<string, number>();
  for (const m of memberships ?? []) {
    if (m.accepted_at) managerCounts.set(m.tenant_id, (managerCounts.get(m.tenant_id) ?? 0) + 1);
  }

  const parentCounts = new Map<string, number>();
  for (const p of parents ?? []) {
    parentCounts.set(p.tenant_id, (parentCounts.get(p.tenant_id) ?? 0) + 1);
  }

  return c.json({
    teams: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      managerCount: managerCounts.get(t.id) ?? 0,
      parentCount: parentCounts.get(t.id) ?? 0,
    })),
  });
});

// ─── PATCH /api/teams/:id ─────────────────────────────────────────────────────
// Auth: superadmin

const updateTeamStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

app.patch('/:id', jsonValidator(updateTeamStatusSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .update({ status: body.status })
    .eq('id', id)
    .select('id, name, slug, join_token, status')
    .maybeSingle();

  if (error || !tenant) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Team not found');
  }

  return c.json({ team: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, joinToken: tenant.join_token } });
});

export default app;
