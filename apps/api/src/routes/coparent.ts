import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin, supabaseAuth } from '../lib/supabase.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator } from '../lib/validation.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';
import { resolveTenantId } from '../lib/context.js';

const app = new Hono();

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

// ─── Shared: ensure a parent has a family, creating one if needed ─────────────

async function ensureFamily(parentId: string, tenantId: string): Promise<string> {
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('family_id')
    .eq('id', parentId)
    .single();

  if (parent?.family_id) return parent.family_id;

  // Create a new family and assign it to this parent
  const { data: family, error: familyError } = await supabaseAdmin
    .from('families')
    .insert({ tenant_id: tenantId })
    .select('id')
    .single();

  if (familyError || !family) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create family');
  }

  await supabaseAdmin
    .from('parents')
    .update({ family_id: family.id })
    .eq('id', parentId);

  return family.id;
}

// ─── POST /api/co-parent/invite ──────────────────────────────────────────────
// Auth: parent — creates an invite for a co-parent to join their family

app.post('/invite', resolveAuthContext, requireContext('parent'), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');

  const familyId = await ensureFamily(ctx.parentId, ctx.tenantId);
  const inviteToken = generateToken('cpi_');

  const { error } = await supabaseAdmin.from('co_parent_invites').insert({
    tenant_id: ctx.tenantId,
    family_id: familyId,
    invite_token: inviteToken,
    invited_by_parent_id: ctx.parentId,
  });

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create co-parent invite');
  }

  return c.json({ inviteUrl: `${WEB_URL}/co-parent-invite/${inviteToken}` });
});

// ─── POST /api/team/parents/:parentId/co-parent-invite ───────────────────────
// Auth: manager or superadmin — creates a co-parent invite on behalf of a family

const managerApp = new Hono();
managerApp.use('*', resolveAuthContext, requireContext('manager', 'superadmin'));

managerApp.post('/:parentId/co-parent-invite', async (c) => {
  const ctx = c.get('authContext');
  const tenantId = resolveTenantId(ctx, c.req.header('X-Tenant-Id'));
  const parentId = c.req.param('parentId');

  // Verify parent belongs to this tenant
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, tenant_id')
    .eq('id', parentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!parent) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Parent not found');
  }

  const familyId = await ensureFamily(parentId, tenantId);
  const inviteToken = generateToken('cpi_');

  const { error } = await supabaseAdmin.from('co_parent_invites').insert({
    tenant_id: tenantId,
    family_id: familyId,
    invite_token: inviteToken,
    invited_by_parent_id: null, // manager-initiated
  });

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create co-parent invite');
  }

  return c.json({ inviteUrl: `${WEB_URL}/co-parent-invite/${inviteToken}` });
});

// ─── GET /api/co-parent-invite/:token ────────────────────────────────────────
// Auth: none — public, returns team name so the invite page can display it

app.get('/invite/:token', async (c) => {
  const token = c.req.param('token');

  const { data: invite } = await supabaseAdmin
    .from('co_parent_invites')
    .select('id, accepted_at, family_id, tenant_id')
    .eq('invite_token', token)
    .maybeSingle();

  if (!invite) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Invalid or expired invite link');
  }
  if (invite.accepted_at) {
    throw apiError(409, ErrorCode.CONFLICT, 'This invite has already been accepted');
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, slug, status')
    .eq('id', invite.tenant_id)
    .single();

  if (!tenant || tenant.status === 'inactive') {
    throw apiError(403, ErrorCode.TEAM_INACTIVE, 'This team is no longer active');
  }

  return c.json({ teamName: tenant.name, teamSlug: tenant.slug });
});

// ─── POST /api/co-parent-invite/:token/accept ────────────────────────────────
// Auth: none — public, creates a new parent record in the same family

const acceptSchema = z.object({
  parentName: z.string().min(1, 'parentName is required'),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().min(1).optional(),
}).refine((d) => Boolean(d.contactEmail) || Boolean(d.contactPhone), {
  message: 'At least one of contactEmail or contactPhone is required',
  path: ['contactEmail'],
});

app.post('/invite/:token/accept', jsonValidator(acceptSchema), async (c) => {
  const token = c.req.param('token');
  const body = c.req.valid('json');

  const { data: invite } = await supabaseAdmin
    .from('co_parent_invites')
    .select('id, accepted_at, family_id, tenant_id')
    .eq('invite_token', token)
    .maybeSingle();

  if (!invite) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Invalid or expired invite link');
  }
  if (invite.accepted_at) {
    throw apiError(409, ErrorCode.CONFLICT, 'This invite has already been accepted');
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('status')
    .eq('id', invite.tenant_id)
    .single();

  if (!tenant || tenant.status === 'inactive') {
    throw apiError(403, ErrorCode.TEAM_INACTIVE, 'This team is no longer active');
  }

  const accessToken = generateToken('pat_');
  const accessTokenHash = await hashToken(accessToken);

  // Create Supabase Auth user if email provided
  let supabaseUserId: string | null = null;
  if (body.contactEmail) {
    try {
      const { data: created } = await supabaseAdmin.auth.admin.createUser({
        email: body.contactEmail,
        email_confirm: true,
      });
      supabaseUserId = created.user?.id ?? null;
    } catch {
      // Non-fatal — magic link login won't work but pat_ token still will
    }
  }

  const { data: parent, error: parentError } = await supabaseAdmin
    .from('parents')
    .insert({
      tenant_id: invite.tenant_id,
      family_id: invite.family_id,
      name: body.parentName,
      contact_email: body.contactEmail ?? null,
      contact_phone: body.contactPhone ?? null,
      access_token_hash: accessTokenHash,
      ...(supabaseUserId ? { supabase_user_id: supabaseUserId } : {}),
    })
    .select('id, name')
    .single();

  if (parentError || !parent) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to register co-parent');
  }

  // Mark invite as accepted
  await supabaseAdmin
    .from('co_parent_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  return c.json({ accessToken, parent: { id: parent.id, name: parent.name } }, 201);
});

export { managerApp as coParentManagerRouter };
export default app;
