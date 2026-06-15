import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { serve } from '@hono/node-server';

import publicRouter from './routes/public.js';
import teamsRouter from './routes/teams.js';
import teamRouter from './routes/team.js';
import rosterRouter from './routes/roster.js';
import meRouter from './routes/me.js';
import kidsRouter from './routes/kids.js';
import sessionsRouter from './routes/sessions.js';
import announcementsRouter from './routes/announcements.js';

const app = new Hono();

// ─── Global middleware ────────────────────────────────────────────────────────

app.use('*', logger());
app.use('*', cors({
  origin: [
    process.env.WEB_URL ?? 'http://localhost:5173',
    process.env.ADMIN_URL ?? 'http://localhost:5174',
  ],
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public — no auth (join flow, manager invite acceptance)
app.route('/api', publicRouter);

// Superadmin — team management
app.route('/api/teams', teamsRouter);

// Manager — team settings (rename, join link, API key, manager roster)
app.route('/api/team', teamRouter);

// Manager — parent/kid roster
app.route('/api/roster', rosterRouter);

// Parent — own profile + kids
app.route('/api/me', meRouter);
app.route('/api/kids', kidsRouter);

// Sessions + attendance — manager, parent, or apikey (scoped per-route)
app.route('/api/sessions', sessionsRouter);

// Announcements — manager or parent
app.route('/api/announcements', announcementsRouter);

// ─── Error handling ───────────────────────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    try {
      const body = JSON.parse(err.message);
      return c.json(body, err.status);
    } catch {
      return c.json({ error: { code: 'internal_error', message: err.message } }, err.status);
    }
  }
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500);
});

// ─── Server ───────────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3000');

serve({ fetch: app.fetch, port }, () => {
  console.log(`API running on http://localhost:${port}`);
});

export default app;
