import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, cleanupAll, createTenant, createManager, registerParent } from '../helpers.js';

describe('parent join-link registration', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    tenant = await createTenant();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('POST /api/join/:joinToken returns 201 with a raw access token, parent, and kids', async () => {
    const res = await registerParent(tenant.join_token, {
      parentName: 'Jane Smith',
      contactEmail: 'jane@example.com',
      kids: [{ name: 'Kid A' }, { name: 'Kid B' }],
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken.startsWith('pat_')).toBe(true);
    expect(res.body.parent.name).toBe('Jane Smith');
    expect(res.body.kids).toHaveLength(2);

    // The returned token authenticates against /api/me, scoped to this team.
    const me = await api('/api/me', { token: res.body.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.parent.name).toBe('Jane Smith');
    expect(me.body.kids.map((k: { name: string }) => k.name).sort()).toEqual(['Kid A', 'Kid B']);
  });

  it('GET /api/join/:joinToken returns the team name and slug', async () => {
    const res = await api(`/api/join/${tenant.join_token}`);
    expect(res.status).toBe(200);
    expect(res.body.teamSlug).toBe(tenant.slug);
    expect(res.body.teamName).toBe(tenant.name);
  });

  it('GET /api/join/:joinToken returns 404 for an invalid token', async () => {
    const res = await api('/api/join/not-a-real-token');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('parent re-registration after lost token', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;

  beforeAll(async () => {
    tenant = await createTenant();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('registering again with the same name/contact creates a second, independent parent record', async () => {
    const first = await registerParent(tenant.join_token, {
      parentName: 'Re-registering Parent',
      contactEmail: 'reregister@example.com',
      kids: [{ name: 'Original Kid' }],
    });
    expect(first.status).toBe(201);

    const second = await registerParent(tenant.join_token, {
      parentName: 'Re-registering Parent',
      contactEmail: 'reregister@example.com',
      kids: [{ name: 'New Kid' }],
    });
    expect(second.status).toBe(201);

    expect(second.body.parent.id).not.toBe(first.body.parent.id);
    expect(second.body.accessToken).not.toBe(first.body.accessToken);

    // Both tokens remain independently valid.
    const firstMe = await api('/api/me', { token: first.body.accessToken });
    expect(firstMe.status).toBe(200);
    expect(firstMe.body.kids.map((k: { name: string }) => k.name)).toEqual(['Original Kid']);

    const secondMe = await api('/api/me', { token: second.body.accessToken });
    expect(secondMe.status).toBe(200);
    expect(secondMe.body.kids.map((k: { name: string }) => k.name)).toEqual(['New Kid']);
  });
});

describe('join link regeneration', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let oldJoinToken: string;
  let existingParentToken: string;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);
    oldJoinToken = tenant.join_token;

    const join = await registerParent(oldJoinToken, {
      parentName: 'Existing Parent',
      contactEmail: 'existing-parent@example.com',
      kids: [{ name: 'Kid' }],
    });
    existingParentToken = join.body.accessToken;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('invalidates the old link but leaves existing parent tokens working', async () => {
    const regen = await api('/api/team/join-link/regenerate', { method: 'POST', token: manager.token });
    expect(regen.status).toBe(200);
    expect(regen.body.parentJoinUrl).toContain('/join/');
    const newJoinToken = regen.body.parentJoinUrl.split('/join/')[1];
    expect(newJoinToken).not.toBe(oldJoinToken);

    const oldLookup = await api(`/api/join/${oldJoinToken}`);
    expect(oldLookup.status).toBe(404);

    const newLookup = await api(`/api/join/${newJoinToken}`);
    expect(newLookup.status).toBe(200);

    const me = await api('/api/me', { token: existingParentToken });
    expect(me.status).toBe(200);
  });
});

describe('attendance default, update, ownership, and cross-parent visibility', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let p1Token: string;
  let p1KidId: string;
  let p2Token: string;
  let p2KidId: string;
  let sessionId: string;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);

    const join1 = await registerParent(tenant.join_token, {
      parentName: 'Parent One',
      contactEmail: 'parent-one@example.com',
      kids: [{ name: 'Kid One' }],
    });
    p1Token = join1.body.accessToken;
    p1KidId = join1.body.kids[0].id;

    const join2 = await registerParent(tenant.join_token, {
      parentName: 'Parent Two',
      contactEmail: 'parent-two@example.com',
      kids: [{ name: 'Kid Two' }],
    });
    p2Token = join2.body.accessToken;
    p2KidId = join2.body.kids[0].id;

    const session = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Practice', date: '2026-08-01', time: '17:00', location: 'Field 2' },
    });
    sessionId = session.body.session.id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('defaults attendance to no_response for every kid on the team', async () => {
    const res = await api('/api/sessions?from=2026-08-01&to=2026-08-01', { token: p1Token });
    expect(res.status).toBe(200);
    const session = res.body.sessions.find((s: { id: string }) => s.id === sessionId);
    expect(session).toBeDefined();
    const byKid = new Map(session.attendance.map((a: { kidId: string; status: string }) => [a.kidId, a.status]));
    expect(byKid.get(p1KidId)).toBe('no_response');
    expect(byKid.get(p2KidId)).toBe('no_response');
  });

  it('a parent can mark their own kid attending, reflected on subsequent reads', async () => {
    const update = await api(`/api/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      token: p1Token,
      body: { updates: [{ kidId: p1KidId, status: 'attending' }] },
    });
    expect(update.status).toBe(200);

    const res = await api('/api/sessions?from=2026-08-01&to=2026-08-01', { token: p1Token });
    const session = res.body.sessions.find((s: { id: string }) => s.id === sessionId);
    const byKid = new Map(session.attendance.map((a: { kidId: string; status: string }) => [a.kidId, a.status]));
    expect(byKid.get(p1KidId)).toBe('attending');
    expect(byKid.get(p2KidId)).toBe('no_response');
  });

  it('rejects a parent updating another parent’s kid attendance with 403', async () => {
    const res = await api(`/api/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      token: p1Token,
      body: { updates: [{ kidId: p2KidId, status: 'attending' }] },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('attendance marked by one parent is visible to other parents on the team', async () => {
    const res = await api('/api/sessions?from=2026-08-01&to=2026-08-01', { token: p2Token });
    const session = res.body.sessions.find((s: { id: string }) => s.id === sessionId);
    const p1Entry = session.attendance.find((a: { kidId: string }) => a.kidId === p1KidId);
    expect(p1Entry).toBeDefined();
    expect(p1Entry.kidName).toBe('Kid One');
    expect(p1Entry.status).toBe('attending');
  });
});

describe('kid archiving preserves attendance history', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentToken: string;
  let kidId: string;
  let pastSessionId: string;
  let futureSessionId: string;
  const pastDate = '2020-01-01';
  const futureDate = '2099-01-01';

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);

    const join = await registerParent(tenant.join_token, {
      parentName: 'Archiving Parent',
      contactEmail: 'archiving-parent@example.com',
      kids: [{ name: 'Archivable Kid' }],
    });
    parentToken = join.body.accessToken;
    kidId = join.body.kids[0].id;

    const past = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Past Session', date: pastDate, time: '10:00', location: 'Field 1' },
    });
    pastSessionId = past.body.session.id;

    const future = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Future Session', date: futureDate, time: '10:00', location: 'Field 1' },
    });
    futureSessionId = future.body.session.id;

    // Mark the kid attending on the past session, leave the future one untouched (no_response).
    await api(`/api/sessions/${pastSessionId}/attendance`, {
      method: 'PUT',
      token: parentToken,
      body: { updates: [{ kidId, status: 'attending' }] },
    });
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('archiving removes the kid from /api/me', async () => {
    const res = await api(`/api/kids/${kidId}`, {
      method: 'PATCH',
      token: parentToken,
      body: { archived: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.kid.archivedAt).not.toBeNull();

    const me = await api('/api/me', { token: parentToken });
    expect(me.body.kids.map((k: { id: string }) => k.id)).not.toContain(kidId);
  });

  it('the past session still shows the archived kid’s attending status', async () => {
    const res = await api(`/api/sessions?from=${pastDate}&to=${pastDate}`, { token: parentToken });
    const session = res.body.sessions.find((s: { id: string }) => s.id === pastSessionId);
    const entry = session.attendance.find((a: { kidId: string }) => a.kidId === kidId);
    expect(entry).toBeDefined();
    expect(entry.status).toBe('attending');
  });

  it('the future session omits the archived kid (no longer prompted)', async () => {
    const res = await api(`/api/sessions?from=${futureDate}&to=${futureDate}`, { token: parentToken });
    const session = res.body.sessions.find((s: { id: string }) => s.id === futureSessionId);
    const entry = session.attendance.find((a: { kidId: string }) => a.kidId === kidId);
    expect(entry).toBeUndefined();
  });

  it('un-archiving restores the kid to /api/me and future attendance prompts', async () => {
    const res = await api(`/api/kids/${kidId}`, {
      method: 'PATCH',
      token: parentToken,
      body: { archived: false },
    });
    expect(res.status).toBe(200);
    expect(res.body.kid.archivedAt).toBeNull();

    const me = await api('/api/me', { token: parentToken });
    expect(me.body.kids.map((k: { id: string }) => k.id)).toContain(kidId);

    const future = await api(`/api/sessions?from=${futureDate}&to=${futureDate}`, { token: parentToken });
    const session = future.body.sessions.find((s: { id: string }) => s.id === futureSessionId);
    expect(session.attendance.map((a: { kidId: string }) => a.kidId)).toContain(kidId);
  });
});
