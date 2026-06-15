import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator } from '../lib/validation.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';
import { requireTenantContext } from '../lib/context.js';

const app = new Hono();

app.use('*', resolveAuthContext);

function isBlankHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim().length === 0;
}

// ─── GET /api/announcements ──────────────────────────────────────────────────
// Auth: manager or parent — newest first

app.get('/', requireContext('manager', 'parent'), async (c) => {
  const ctx = requireTenantContext(c.get('authContext'));

  const { data: announcements, error } = await supabaseAdmin
    .from('announcements')
    .select('id, author_name_snapshot, body_html, created_at, updated_at')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to load announcements');
  }

  return c.json({
    announcements: (announcements ?? []).map((a) => ({
      id: a.id,
      authorName: a.author_name_snapshot,
      bodyHtml: a.body_html,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    })),
  });
});

// ─── POST /api/announcements ─────────────────────────────────────────────────
// Auth: manager — rejected with 400 if empty/whitespace-only after stripping tags

const announcementBodySchema = z.object({
  bodyHtml: z.string(),
});

app.post('/', requireContext('manager'), jsonValidator(announcementBodySchema), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'manager') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Manager only');
  const body = c.req.valid('json');

  if (isBlankHtml(body.bodyHtml)) {
    throw apiError(400, ErrorCode.VALIDATION, 'Announcement body cannot be empty');
  }

  const { data: user } = await supabaseAdmin.auth.admin.getUserById(ctx.userId);
  const authorName = user.user?.email ?? 'Unknown';

  const { data: announcement, error } = await supabaseAdmin
    .from('announcements')
    .insert({
      tenant_id: ctx.tenantId,
      author_user_id: ctx.userId,
      author_name_snapshot: authorName,
      body_html: body.bodyHtml,
    })
    .select('id, author_name_snapshot, body_html, created_at, updated_at')
    .single();

  if (error || !announcement) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create announcement');
  }

  return c.json(
    {
      announcement: {
        id: announcement.id,
        authorName: announcement.author_name_snapshot,
        bodyHtml: announcement.body_html,
        createdAt: announcement.created_at,
        updatedAt: announcement.updated_at,
      },
    },
    201,
  );
});

// ─── PATCH /api/announcements/:id ─────────────────────────────────────────────
// Auth: manager — same non-empty validation as POST

app.patch('/:id', requireContext('manager'), jsonValidator(announcementBodySchema), async (c) => {
  const ctx = requireTenantContext(c.get('authContext'));
  const id = c.req.param('id');
  const body = c.req.valid('json');

  if (isBlankHtml(body.bodyHtml)) {
    throw apiError(400, ErrorCode.VALIDATION, 'Announcement body cannot be empty');
  }

  const { data: announcement, error } = await supabaseAdmin
    .from('announcements')
    .update({ body_html: body.bodyHtml, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id, author_name_snapshot, body_html, created_at, updated_at')
    .maybeSingle();

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to update announcement');
  }
  if (!announcement) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Announcement not found');
  }

  return c.json({
    announcement: {
      id: announcement.id,
      authorName: announcement.author_name_snapshot,
      bodyHtml: announcement.body_html,
      createdAt: announcement.created_at,
      updatedAt: announcement.updated_at,
    },
  });
});

// ─── DELETE /api/announcements/:id ────────────────────────────────────────────
// Auth: manager

app.delete('/:id', requireContext('manager'), async (c) => {
  const ctx = requireTenantContext(c.get('authContext'));
  const id = c.req.param('id');

  const { data: announcement } = await supabaseAdmin
    .from('announcements')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!announcement) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Announcement not found');
  }

  const { error } = await supabaseAdmin.from('announcements').delete().eq('id', id);
  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to delete announcement');
  }

  return c.json({ success: true });
});

export default app;
