import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorCode } from '@lineup/types';
import type { AttendanceStatus } from '@lineup/types';
import { supabaseAdmin } from '../lib/supabase.js';
import { apiError } from '../lib/errors.js';
import { jsonValidator, queryValidator } from '../lib/validation.js';
import { resolveAuthContext, requireContext } from '../middleware/auth.js';
import { requireTenantContext } from '../lib/context.js';

const app = new Hono();

app.use('*', resolveAuthContext);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── GET /api/sessions?from=&to= ─────────────────────────────────────────────
// Auth: manager, parent, or apikey
// Default range: today -> +4 weeks. attendance includes every non-archived
// kid on the team plus any archived kid that already has an attendance row
// for that session (preserves history for past sessions).

const sessionsQuerySchema = z.object({
  from: z.string().regex(DATE_RE, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(DATE_RE, 'to must be YYYY-MM-DD').optional(),
});

app.get(
  '/',
  requireContext('manager', 'parent', 'apikey'),
  queryValidator(sessionsQuerySchema),
  async (c) => {
    const ctx = requireTenantContext(c.get('authContext'));
    const { from, to } = c.req.valid('query');

    const rangeFrom = from ?? todayISO();
    const rangeTo = to ?? addDaysISO(rangeFrom, 28);

    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('id, name, date, time, location')
      .eq('tenant_id', ctx.tenantId)
      .gte('date', rangeFrom)
      .lte('date', rangeTo)
      .order('date')
      .order('time');

    if (sessionsError || !sessions) {
      throw apiError(500, ErrorCode.INTERNAL, 'Failed to load sessions');
    }

    const { data: kids, error: kidsError } = await supabaseAdmin
      .from('kids')
      .select('id, name, archived_at')
      .eq('tenant_id', ctx.tenantId);

    if (kidsError) {
      throw apiError(500, ErrorCode.INTERNAL, 'Failed to load sessions');
    }

    const sessionIds = sessions.map((s) => s.id);
    let attendanceRows: { session_id: string; kid_id: string; status: AttendanceStatus }[] = [];

    if (sessionIds.length > 0) {
      const { data: attendance, error: attendanceError } = await supabaseAdmin
        .from('attendance')
        .select('session_id, kid_id, status')
        .in('session_id', sessionIds);

      if (attendanceError) {
        throw apiError(500, ErrorCode.INTERNAL, 'Failed to load sessions');
      }
      attendanceRows = attendance ?? [];
    }

    const attendanceMap = new Map<string, AttendanceStatus>();
    for (const row of attendanceRows) {
      attendanceMap.set(`${row.session_id}:${row.kid_id}`, row.status);
    }

    return c.json({
      sessions: sessions.map((session) => {
        const relevantKids = (kids ?? []).filter(
          (kid) => !kid.archived_at || attendanceMap.has(`${session.id}:${kid.id}`),
        );

        return {
          id: session.id,
          name: session.name,
          date: session.date,
          time: session.time,
          location: session.location,
          attendance: relevantKids.map((kid) => ({
            kidId: kid.id,
            kidName: kid.name,
            status: attendanceMap.get(`${session.id}:${kid.id}`) ?? 'no_response',
          })),
        };
      }),
    });
  },
);

// ─── POST /api/sessions ───────────────────────────────────────────────────────
// Auth: manager or apikey

const createSessionSchema = z.object({
  name: z.string().min(1, 'name is required'),
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD'),
  time: z.string().regex(TIME_RE, 'time must be HH:MM or HH:MM:SS'),
  location: z.string().min(1, 'location is required'),
});

app.post('/', requireContext('manager', 'apikey'), jsonValidator(createSessionSchema), async (c) => {
  const ctx = requireTenantContext(c.get('authContext'));
  const body = c.req.valid('json');

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      tenant_id: ctx.tenantId,
      name: body.name,
      date: body.date,
      time: body.time,
      location: body.location,
    })
    .select('id, name, date, time, location')
    .single();

  if (error || !session) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to create session');
  }

  return c.json({ session }, 201);
});

// ─── PATCH /api/sessions/:id ──────────────────────────────────────────────────
// Auth: manager or apikey

const updateSessionSchema = z.object({
  name: z.string().min(1).optional(),
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD').optional(),
  time: z.string().regex(TIME_RE, 'time must be HH:MM or HH:MM:SS').optional(),
  location: z.string().min(1).optional(),
});

app.patch('/:id', requireContext('manager', 'apikey'), jsonValidator(updateSessionSchema), async (c) => {
  const ctx = requireTenantContext(c.get('authContext'));
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (body.date !== undefined) update.date = body.date;
  if (body.time !== undefined) update.time = body.time;
  if (body.location !== undefined) update.location = body.location;

  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id, name, date, time, location')
    .maybeSingle();

  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to update session');
  }
  if (!session) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Session not found');
  }

  return c.json({ session });
});

// ─── DELETE /api/sessions/:id ─────────────────────────────────────────────────
// Auth: manager or apikey — cascades to attendance rows

app.delete('/:id', requireContext('manager', 'apikey'), async (c) => {
  const ctx = requireTenantContext(c.get('authContext'));
  const id = c.req.param('id');

  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!session) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Session not found');
  }

  const { error } = await supabaseAdmin.from('sessions').delete().eq('id', id);
  if (error) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to delete session');
  }

  return c.json({ success: true });
});

// ─── PUT /api/sessions/:id/attendance ────────────────────────────────────────
// Auth: parent — kidId in each update must belong to the calling parent

const putAttendanceSchema = z.object({
  updates: z
    .array(
      z.object({
        kidId: z.string().uuid('kidId must be a UUID'),
        status: z.enum(['attending', 'not_attending', 'no_response']),
      }),
    )
    .min(1, 'updates must be non-empty'),
});

app.put('/:id/attendance', requireContext('parent'), jsonValidator(putAttendanceSchema), async (c) => {
  const ctx = c.get('authContext');
  if (ctx.type !== 'parent') throw apiError(403, ErrorCode.ROLE_MISMATCH, 'Parent only');
  const sessionId = c.req.param('id');
  const body = c.req.valid('json');

  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (!session) {
    throw apiError(404, ErrorCode.NOT_FOUND, 'Session not found');
  }

  const kidIds = body.updates.map((u) => u.kidId);
  const { data: kids, error: kidsError } = await supabaseAdmin
    .from('kids')
    .select('id, parent_id')
    .in('id', kidIds);

  if (kidsError) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to update attendance');
  }

  const kidMap = new Map((kids ?? []).map((k) => [k.id, k.parent_id]));
  for (const kidId of kidIds) {
    if (kidMap.get(kidId) !== ctx.parentId) {
      throw apiError(403, ErrorCode.FORBIDDEN, "Cannot modify another parent's kid attendance");
    }
  }

  const now = new Date().toISOString();
  const { error: upsertError } = await supabaseAdmin.from('attendance').upsert(
    body.updates.map((u) => ({
      tenant_id: ctx.tenantId,
      session_id: sessionId,
      kid_id: u.kidId,
      status: u.status,
      updated_at: now,
    })),
    { onConflict: 'session_id,kid_id' },
  );

  if (upsertError) {
    throw apiError(500, ErrorCode.INTERNAL, 'Failed to update attendance');
  }

  return c.json({ attendance: body.updates.map((u) => ({ kidId: u.kidId, status: u.status })) });
});

export default app;
