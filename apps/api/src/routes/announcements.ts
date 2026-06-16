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

// Helper: attach reaction counts and current-parent "reactedByMe" to announcements
async function attachReactions(
  announcementIds: string[],
  parentId: string | null,
): Promise<Map<string, { emoji: string; count: number; reactedByMe: boolean }[]>> {
  if (announcementIds.length === 0) return new Map();

  const { data: reactions } = await supabaseAdmin
    .from('announcement_reactions')
    .select('announcement_id, parent_id, emoji')
    .in('announcement_id', announcementIds);

  const grouped = new Map<string, Map<string, { count: number; reactedByMe: boolean }>>();

  for (const r of reactions ?? []) {
    if (!grouped.has(r.announcement_id)) grouped.set(r.announcement_id, new Map());
    const emojiMap = grouped.get(r.announcement_id)!;
    if (!emojiMap.has(r.emoji)) emojiMap.set(r.emoji, { count: 0, reactedByMe: false });
    const entry = emojiMap.get(r.emoji)!;
    entry.count += 1;
    if (parentId && r.parent_id === parentId) entry.reactedByMe = true;
  }

  const result = new Map<string, { emoji: string; count: number; reactedByMe: boolean }[]>();
  for (const [annId, emojiMap] of grouped) {
    result.set(
      annId,
      [...emojiMap.entries()].map(([emoji, data]) => ({ emoji, ...data })),
    );
  }
  return result;
}

// ─── GET /api/announcements ──────────────────────────────────────────────────
// Auth: manager or parent — newest first, includes reaction counts

app.get('/', requireContext('manager', 'parent'), async (c) => {
  const ctx = requireTenantContext(c.get('authContext'));
  const parentId = ctx.type === 'parent' ? ctx.parentId : null;

  const { data: announcements, error } = await supabaseAdmin
    .from('announcements')
    .select('id, author_name_snapshot, body_html, created_at, updated_at')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to load announcements');
  }

  const ids = (announcements ?? []).map((a) => a.id);
  const reactionsMap = await attachReactions(ids, parentId);

  return c.json({
    announcements: (announcements ?? []).map((a) => ({
      id: a.id,
      authorName: a.author_name_snapshot,
      bodyHtml: a.body_html,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
      reactions: reactionsMap.get(a.id) ?? [],
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
        reactions: [],
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

  const reactionsMap = await attachReactions([announcement.id], null);

  return c.json({
    announcement: {
      id: announcement.id,
      authorName: announcement.author_name_snapshot,
      bodyHtml: announcement.body_html,
      createdAt: announcement.created_at,
      updatedAt: announcement.updated_at,
      reactions: reactionsMap.get(announcement.id) ?? [],
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

// ─── POST /api/announcements/:id/reactions ────────────────────────────────────
// Auth: parent — toggle-adds an emoji reaction (idempotent: no error if exists)

const ALLOWED_EMOJIS = ['👍', '👎', '❤️', '🎉', '💪', '👏'];

const reactionSchema = z.object({
  emoji: z.string().refine((e) => ALLOWED_EMOJIS.includes(e), {
    message: `emoji must be one of: ${ALLOWED_EMOJIS.join(' ')}`,
  }),
});

app.post('/:id/reactions', requireContext('parent'), jsonValidator(reactionSchema), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');
  const announcementId = c.req.param('id');
  const body = c.req.valid('json');

  // Verify announcement belongs to this tenant
  const { data: ann } = await supabaseAdmin
    .from('announcements')
    .select('id')
    .eq('id', announcementId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!ann) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Announcement not found');
  }

  // Upsert — silently succeeds if the reaction already exists
  const { error } = await supabaseAdmin.from('announcement_reactions').upsert(
    {
      tenant_id: ctx.tenantId,
      announcement_id: announcementId,
      parent_id: ctx.parentId,
      emoji: body.emoji,
    },
    { onConflict: 'announcement_id,parent_id,emoji', ignoreDuplicates: true },
  );

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to add reaction');
  }

  const reactionsMap = await attachReactions([announcementId], ctx.parentId);
  return c.json({ reactions: reactionsMap.get(announcementId) ?? [] });
});

// ─── DELETE /api/announcements/:id/reactions/:emoji ───────────────────────────
// Auth: parent — remove a specific emoji reaction (idempotent)

app.delete('/:id/reactions/:emoji', requireContext('parent'), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');
  const announcementId = c.req.param('id');
  const emoji = decodeURIComponent(c.req.param('emoji'));

  await supabaseAdmin
    .from('announcement_reactions')
    .delete()
    .eq('announcement_id', announcementId)
    .eq('parent_id', ctx.parentId)
    .eq('emoji', emoji);

  const reactionsMap = await attachReactions([announcementId], ctx.parentId);
  return c.json({ reactions: reactionsMap.get(announcementId) ?? [] });
});

export default app;
