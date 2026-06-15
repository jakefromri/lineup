import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';

import publicRouter from './routes/public.js';
import teamsRouter from './routes/teams.js';
import teamRouter from './routes/team.js';
import rosterRouter from './routes/roster.js';
import meRouter from './routes/me.js';
import kidsRouter from './routes/kids.js';
import sessionsRouter from './routes/sessions.js';
import announcementsRouter from './routes/announcements.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null;
    const allowed = [
      process.env.WEB_URL ?? 'http://localhost:5173',
      process.env.ADMIN_URL ?? 'http://localhost:5174',
    ];
    // Allow any *.vercel.app subdomain for preview deployments
    if (allowed.includes(origin) || origin.endsWith('.vercel.app')) return origin;
    return null;
  },
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/api', publicRouter);
app.route('/api/teams', teamsRouter);
app.route('/api/team', teamRouter);
app.route('/api/roster', rosterRouter);
app.route('/api/me', meRouter);
app.route('/api/kids', kidsRouter);
app.route('/api/sessions', sessionsRouter);
app.route('/api/announcements', announcementsRouter);

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

export default app;
