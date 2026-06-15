import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator } from '../lib/validation.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';

const app = new Hono();

app.use('*', resolveAuthContext, requireContext('parent'));

// ─── PATCH /api/kids/:id ──────────────────────────────────────────────────────
// Auth: parent (own kid only)
// archived: true sets archived_at = now() (soft delete). archived: false
// clears it. Attendance rows are never deleted by this endpoint.

const updateKidSchema = z.object({
  name: z.string().min(1).optional(),
  archived: z.boolean().optional(),
});

app.patch('/:id', jsonValidator(updateKidSchema), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const { data: kid, error: kidError } = await supabaseAdmin
    .from('kids')
    .select('id, parent_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!kid) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Kid not found');
  }
  if (kid.parent_id !== ctx.parentId) {
    throw apiError(403, ErrorCode.FORBIDDEN, "Cannot modify another parent's kid");
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.archived !== undefined) {
    update.archived_at = body.archived ? new Date().toISOString() : null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('kids')
    .update(update)
    .eq('id', id)
    .select('id, name, archived_at')
    .single();

  if (error || !updated) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to update kid');
  }

  return c.json({ kid: { id: updated.id, name: updated.name, archivedAt: updated.archived_at } });
});

export default app;
