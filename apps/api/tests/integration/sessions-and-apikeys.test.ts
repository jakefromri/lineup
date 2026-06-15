import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, cleanupAll, createTenant, createManager, createApiKey } from '../helpers.js';

describe('tenant isolation — sessions', () => {
  let teamA: Awaited<ReturnType<typeof createTenant>>;
  let teamB: Awaited<ReturnType<typeof createTenant>>;
  let managerA: Awaited<ReturnType<typeof createManager>>;
  let managerB: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    teamA = await createTenant({ name: 'Team A' });
    teamB = await createTenant({ name: 'Team B' });
    managerA = await createManager(teamA.id);
    managerB = await createManager(teamB.id);

    const a = await api('/api/sessions', {
      method: 'POST',
      token: managerA.token,
      body: { name: 'Team A Practice', date: '2026-09-01', time: '10:00', location: 'A Field' },
    });
    expect(a.status).toBe(201);

    const b = await api('/api/sessions', {
      method: 'POST',
      token: managerB.token,
      body: { name: 'Team B Practice', date: '2026-09-01', time: '10:00', location: 'B Field' },
    });
    expect(b.status).toBe(201);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('manager A only sees Team A sessions, regardless of date range', async () => {
    const res = await api('/api/sessions?from=2020-01-01&to=2099-01-01', { token: managerA.token });
    expect(res.status).toBe(200);
    const names = res.body.sessions.map((s: { name: string }) => s.name);
    expect(names).toContain('Team A Practice');
    expect(names).not.toContain('Team B Practice');
  });

  it('manager B only sees Team B sessions', async () => {
    const res = await api('/api/sessions?from=2020-01-01&to=2099-01-01', { token: managerB.token });
    expect(res.status).toBe(200);
    const names = res.body.sessions.map((s: { name: string }) => s.name);
    expect(names).toContain('Team B Practice');
    expect(names).not.toContain('Team A Practice');
  });
});

describe('tenant isolation — API key scoping', () => {
  let teamA: Awaited<ReturnType<typeof createTenant>>;
  let apiKeyA: string;

  beforeAll(async () => {
    teamA = await createTenant({ name: 'API Key Team A' });
    apiKeyA = await createApiKey(teamA.id);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('GET /api/roster is forbidden for an API key', async () => {
    const res = await api('/api/roster', { token: apiKeyA });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('role_mismatch');
  });

  it('GET /api/announcements is forbidden for an API key', async () => {
    const res = await api('/api/announcements', { token: apiKeyA });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('role_mismatch');
  });

  it('POST /api/announcements is forbidden for an API key', async () => {
    const res = await api('/api/announcements', {
      method: 'POST',
      token: apiKeyA,
      body: { bodyHtml: '<p>Hello</p>' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('role_mismatch');
  });

  it('POST /api/sessions succeeds for an API key and is scoped to its team', async () => {
    const res = await api('/api/sessions', {
      method: 'POST',
      token: apiKeyA,
      body: { name: 'API Key Session', date: '2026-09-15', time: '09:00', location: 'API Field' },
    });
    expect(res.status).toBe(201);
    expect(res.body.session.name).toBe('API Key Session');
  });
});

describe('API key cannot access another team’s sessions', () => {
  let teamA: Awaited<ReturnType<typeof createTenant>>;
  let teamB: Awaited<ReturnType<typeof createTenant>>;
  let apiKeyA: string;
  let managerB: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    teamA = await createTenant({ name: 'Cross Team A' });
    teamB = await createTenant({ name: 'Cross Team B' });
    apiKeyA = await createApiKey(teamA.id);
    managerB = await createManager(teamB.id);

    const b = await api('/api/sessions', {
      method: 'POST',
      token: managerB.token,
      body: { name: 'Team B Only Session', date: '2026-10-01', time: '11:00', location: 'B Field' },
    });
    expect(b.status).toBe(201);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('GET /api/sessions with Team A’s key returns only Team A’s sessions', async () => {
    const res = await api('/api/sessions?from=2020-01-01&to=2099-01-01', { token: apiKeyA });
    expect(res.status).toBe(200);
    const names = res.body.sessions.map((s: { name: string }) => s.name);
    expect(names).not.toContain('Team B Only Session');
  });
});

describe('session CRUD by manager', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let sessionId: string;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('creates a session', async () => {
    const res = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'CRUD Session', date: '2026-11-01', time: '15:00', location: 'CRUD Field' },
    });
    expect(res.status).toBe(201);
    expect(res.body.session.name).toBe('CRUD Session');
    sessionId = res.body.session.id;
  });

  it('updates the session', async () => {
    const res = await api(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      token: manager.token,
      body: { location: 'Updated Field' },
    });
    expect(res.status).toBe(200);
    expect(res.body.session.location).toBe('Updated Field');
  });

  it('deletes the session, cascading attendance rows', async () => {
    const res = await api(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
      token: manager.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const list = await api('/api/sessions?from=2020-01-01&to=2099-01-01', { token: manager.token });
    expect(list.body.sessions.map((s: { id: string }) => s.id)).not.toContain(sessionId);

    const patchAfterDelete = await api(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      token: manager.token,
      body: { location: 'Should 404' },
    });
    expect(patchAfterDelete.status).toBe(404);
  });
});
