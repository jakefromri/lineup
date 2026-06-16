import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { generateToken, hashToken } from '../lib/tokens.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator } from '../lib/validation.js';

const app = new Hono();

// ─── GET /api/join/:joinToken ────────────────────────────────────────────────
// Auth: none

app.get('/join/:joinToken', async (c) => {
  const joinToken = c.req.param('joinToken');

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, slug, status')
    .eq('join_token', joinToken)
    .maybeSingle();

  if (!tenant) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Invalid or revoked join link');
  }
  if (tenant.status === 'inactive') {
    throw apiError(403, ErrorCode.TEAM_INACTIVE, 'This team is no longer active');
  }

  return c.json({ teamName: tenant.name, teamSlug: tenant.slug });
});

// ─── POST /api/join/:joinToken ───────────────────────────────────────────────
// Auth: none

const joinBodySchema = z
  .object({
    parentName: z.string().min(1, 'parentName is required'),
    contactEmail: z.string().email('contactEmail must be a valid email').optional(),
    contactPhone: z.string().min(1).optional(),
    kids: z.array(z.object({ name: z.string().min(1, 'kid name is required') })).min(1, 'At least one kid is required'),
  })
  .refine((data) => Boolean(data.contactEmail) || Boolean(data.contactPhone), {
    message: 'At least one of contactEmail or contactPhone is required',
    path: ['contactEmail'],
  });

app.post('/join/:joinToken', jsonValidator(joinBodySchema), async (c) => {
  const joinToken = c.req.param('joinToken');
  const body = c.req.valid('json');

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, status')
    .eq('join_token', joinToken)
    .maybeSingle();

  if (!tenant) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Invalid or revoked join link');
  }
  if (tenant.status === 'inactive') {
    throw apiError(403, ErrorCode.TEAM_INACTIVE, 'This team is no longer active');
  }

  const accessToken = generateToken('pat_');
  const accessTokenHash = await hashToken(accessToken);

  // Create Supabase Auth user if email provided — enables magic-link login later.
  // Non-fatal: if this fails, the parent still registers with pat_ token only.
  let supabaseUserId: string | null = null;
  if (body.contactEmail) {
    try {
      const { data: created } = await supabaseAdmin.auth.admin.createUser({
        email: body.contactEmail,
        email_confirm: true,
      });
      supabaseUserId = created.user?.id ?? null;
    } catch {
      // Non-fatal
    }
  }

  const { data: parent, error: parentError } = await supabaseAdmin
    .from('parents')
    .insert({
      tenant_id: tenant.id,
      name: body.parentName,
      contact_email: body.contactEmail ?? null,
      contact_phone: body.contactPhone ?? null,
      access_token_hash: accessTokenHash,
      ...(supabaseUserId ? { supabase_user_id: supabaseUserId } : {}),
    })
    .select('id, name')
    .single();

  if (parentError || !parent) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to register parent');
  }

  const { data: kids, error: kidsError } = await supabaseAdmin
    .from('kids')
    .insert(body.kids.map((k) => ({ tenant_id: tenant.id, parent_id: parent.id, name: k.name })))
    .select('id, name');

  if (kidsError || !kids) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to register kids');
  }

  return c.json(
    {
      accessToken,
      parent: { id: parent.id, name: parent.name },
      kids,
    },
    201,
  );
});

// ─── POST /api/invites/:token/accept ─────────────────────────────────────────
// Auth: none

const acceptInviteSchema = z.object({
  email: z.string().email('email must be a valid email'),
  password: z.string().min(10, 'password must be at least 10 characters'),
});

app.post('/invites/:token/accept', jsonValidator(acceptInviteSchema), async (c) => {
  const token = c.req.param('token');
  const body = c.req.valid('json');

  const { data: membership } = await supabaseAdmin
    .from('memberships')
    .select('id, tenant_id, accepted_at')
    .eq('invite_token', token)
    .maybeSingle();

  if (!membership) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Invalid invite link');
  }
  if (membership.accepted_at) {
    throw apiError(409, ErrorCode.CONFLICT, 'This invite has already been accepted');
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    app_metadata: { role: 'manager', tenant_id: membership.tenant_id },
  });

  if (createError || !created.user) {
    throw apiError(400, ErrorCode.VALIDATION, createError?.message ?? 'Failed to create account');
  }

  const { error: updateError } = await supabaseAdmin
    .from('memberships')
    .update({ user_id: created.user.id, accepted_at: new Date().toISOString() })
    .eq('id', membership.id);

  if (updateError) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to finalize invite');
  }

  return c.json({ success: true });
});

export default app;
