import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator } from '../lib/validation.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';

const app = new Hono();

app.use('*', resolveAuthContext, requireContext('parent'));

// ─── GET /api/me ──────────────────────────────────────────────────────────────
// Auth: parent

app.get('/', async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');

  const { data: parent, error: parentError } = await supabaseAdmin
    .from('parents')
    .select('id, name, contact_email, contact_phone')
    .eq('id', ctx.parentId)
    .single();

  if (parentError || !parent) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Parent not found');
  }

  const { data: kids, error: kidsError } = await supabaseAdmin
    .from('kids')
    .select('id, name')
    .eq('parent_id', ctx.parentId)
    .is('archived_at', null)
    .order('created_at');

  if (kidsError) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to load kids');
  }

  return c.json({
    parent: {
      id: parent.id,
      name: parent.name,
      contactEmail: parent.contact_email,
      contactPhone: parent.contact_phone,
    },
    kids: kids ?? [],
  });
});

// ─── PATCH /api/me ────────────────────────────────────────────────────────────
// Auth: parent

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: z.string().min(1).nullable().optional(),
});

app.patch('/', jsonValidator(updateMeSchema), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');
  const body = c.req.valid('json');

  const { data: current, error: currentError } = await supabaseAdmin
    .from('parents')
    .select('contact_email, contact_phone')
    .eq('id', ctx.parentId)
    .single();

  if (currentError || !current) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Parent not found');
  }

  const nextEmail = body.contactEmail === undefined ? current.contact_email : body.contactEmail;
  const nextPhone = body.contactPhone === undefined ? current.contact_phone : body.contactPhone;

  if (!nextEmail && !nextPhone) {
    throw apiError(400, ErrorCode.VALIDATION, 'At least one of contactEmail or contactPhone is required');
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.contactEmail !== undefined) update.contact_email = body.contactEmail;
  if (body.contactPhone !== undefined) update.contact_phone = body.contactPhone;

  const { data: parent, error } = await supabaseAdmin
    .from('parents')
    .update(update)
    .eq('id', ctx.parentId)
    .select('id, name, contact_email, contact_phone')
    .single();

  if (error || !parent) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to update profile');
  }

  return c.json({
    parent: {
      id: parent.id,
      name: parent.name,
      contactEmail: parent.contact_email,
      contactPhone: parent.contact_phone,
    },
  });
});

// ─── POST /api/me/kids ────────────────────────────────────────────────────────
// Auth: parent

const addKidSchema = z.object({
  name: z.string().min(1, 'name is required'),
});

app.post('/kids', jsonValidator(addKidSchema), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');
  const body = c.req.valid('json');

  const { data: kid, error } = await supabaseAdmin
    .from('kids')
    .insert({ tenant_id: ctx.tenantId, parent_id: ctx.parentId, name: body.name })
    .select('id, name')
    .single();

  if (error || !kid) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to add kid');
  }

  return c.json({ kid }, 201);
});

export default app;
