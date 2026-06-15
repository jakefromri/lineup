import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  api,
  cleanupAll,
  createTenant,
  createManager,
  createSuperadmin,
  createApiKey,
  registerParent,
} from '../helpers.js';

describe('auth context resolution — prefix routing', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentToken: string;
  let apiKey: string;
  let superadmin: Awaited<ReturnType<typeof createSuperadmin>>;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);
    apiKey = await createApiKey(tenant.id);
    superadmin = await createSuperadmin();

    const join = await registerParent(tenant.join_token, {
      parentName: 'Prefix Parent',
      contactEmail: 'prefix-parent@example.com',
      kids: [{ name: 'Kid' }],
    });
    parentToken = join.body.accessToken;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('a Supabase JWT resolves to a manager context scoped to its tenant', async () => {
    const res = await api('/api/team', { token: manager.token });
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(tenant.id);
  });

  it('a pat_... token resolves to a parent context scoped to its tenant', async () => {
    const res = await api('/api/me', { token: parentToken });
    expect(res.status).toBe(200);
    expect(res.body.parent.name).toBe('Prefix Parent');
  });

  it('an sk_... token resolves to an apikey context scoped to its tenant', async () => {
    const res = await api('/api/sessions', { token: apiKey });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });

  it('a superadmin JWT resolves to a superadmin context', async () => {
    const res = await api('/api/teams', { token: superadmin.token });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.teams)).toBe(true);
  });

  it('rejects requests with no Authorization header', async () => {
    const res = await api('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('rejects an invalid bearer token', async () => {
    const res = await api('/api/me', { token: 'pat_not-a-real-token' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });
});

describe('role-mismatch returns 403, not 401', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let parentToken: string;

  beforeAll(async () => {
    tenant = await createTenant();
    const join = await registerParent(tenant.join_token, {
      parentName: 'Role Mismatch Parent',
      contactEmail: 'role-mismatch@example.com',
      kids: [{ name: 'Kid' }],
    });
    parentToken = join.body.accessToken;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('a valid parent token on a manager-only route (/api/roster) gets 403, not 401', async () => {
    const res = await api('/api/roster', { token: parentToken });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('role_mismatch');
  });
});

describe('attendance status validation', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentToken: string;
  let kidId: string;
  let sessionId: string;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);

    const join = await registerParent(tenant.join_token, {
      parentName: 'Attendance Validation Parent',
      contactEmail: 'attendance-validation@example.com',
      kids: [{ name: 'Kid' }],
    });
    parentToken = join.body.accessToken;
    kidId = join.body.kids[0].id;

    const session = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Practice', date: '2026-07-01', time: '18:00', location: 'Field 1' },
    });
    sessionId = session.body.session.id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('rejects an attendance status outside the allowed enum with 400', async () => {
    const res = await api(`/api/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      token: parentToken,
      body: { updates: [{ kidId, status: 'maybe' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('accepts attending / not_attending / no_response', async () => {
    for (const status of ['attending', 'not_attending', 'no_response']) {
      const res = await api(`/api/sessions/${sessionId}/attendance`, {
        method: 'PUT',
        token: parentToken,
        body: { updates: [{ kidId, status }] },
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance[0].status).toBe(status);
    }
  });
});

describe('parent contact info validation', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let parentToken: string;

  beforeAll(async () => {
    tenant = await createTenant();
    const join = await registerParent(tenant.join_token, {
      parentName: 'Contact Validation Parent',
      contactEmail: 'contact-validation@example.com',
      kids: [{ name: 'Kid' }],
    });
    parentToken = join.body.accessToken;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('rejects PATCH /api/me that would leave both contactEmail and contactPhone null', async () => {
    const res = await api('/api/me', {
      method: 'PATCH',
      token: parentToken,
      body: { contactEmail: null, contactPhone: null },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('allows clearing one contact field as long as the other remains set', async () => {
    const res = await api('/api/me', {
      method: 'PATCH',
      token: parentToken,
      body: { contactPhone: '555-1234' },
    });
    expect(res.status).toBe(200);

    const cleared = await api('/api/me', {
      method: 'PATCH',
      token: parentToken,
      body: { contactEmail: null },
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.parent.contactEmail).toBeNull();
    expect(cleared.body.parent.contactPhone).toBe('555-1234');
  });
});

describe('deactivated team — manager and parent experience', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let superadmin: Awaited<ReturnType<typeof createSuperadmin>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentToken: string;
  let joinToken: string;

  beforeAll(async () => {
    tenant = await createTenant();
    superadmin = await createSuperadmin();
    manager = await createManager(tenant.id);
    joinToken = tenant.join_token;

    const join = await registerParent(joinToken, {
      parentName: 'Deactivated Team Parent',
      contactEmail: 'deactivated-team@example.com',
      kids: [{ name: 'Kid' }],
    });
    parentToken = join.body.accessToken;

    const deactivate = await api(`/api/teams/${tenant.id}`, {
      method: 'PATCH',
      token: superadmin.token,
      body: { status: 'inactive' },
    });
    expect(deactivate.status).toBe(200);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('manager requests return 403 team_inactive', async () => {
    const res = await api('/api/team', { token: manager.token });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('team_inactive');
  });

  it('parent requests (existing access token) return 403 team_inactive', async () => {
    const res = await api('/api/me', { token: parentToken });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('team_inactive');
  });

  it('GET /api/join/:joinToken returns 403 team_inactive', async () => {
    const res = await api(`/api/join/${joinToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('team_inactive');
  });
});

describe('deactivated team blocks API-key session writes', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let superadmin: Awaited<ReturnType<typeof createSuperadmin>>;
  let apiKey: string;

  beforeAll(async () => {
    tenant = await createTenant();
    superadmin = await createSuperadmin();
    apiKey = await createApiKey(tenant.id);

    const deactivate = await api(`/api/teams/${tenant.id}`, {
      method: 'PATCH',
      token: superadmin.token,
      body: { status: 'inactive' },
    });
    expect(deactivate.status).toBe(200);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('POST /api/sessions with the team API key returns 403 team_inactive and creates nothing', async () => {
    const res = await api('/api/sessions', {
      method: 'POST',
      token: apiKey,
      body: { name: 'Should not be created', date: '2026-07-01', time: '18:00', location: 'Field 1' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('team_inactive');
  });
});
