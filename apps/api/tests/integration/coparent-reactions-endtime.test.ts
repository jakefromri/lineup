import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, cleanupAll, createTenant, createManager, registerParent } from '../helpers.js';

// ─── End time ────────────────────────────────────────────────────────────────

describe('session end_time', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('creates a session with end_time and returns it', async () => {
    const res = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Practice', date: '2026-09-01', time: '17:00', endTime: '18:30', location: 'Field 1' },
    });
    expect(res.status).toBe(201);
    expect(res.body.session.endTime).toMatch(/^18:30/);
  });

  it('creates a session without end_time and returns null', async () => {
    const res = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'No End Time', date: '2026-09-02', time: '17:00', location: 'Field 1' },
    });
    expect(res.status).toBe(201);
    expect(res.body.session.endTime).toBeNull();
  });

  it('patches end_time onto an existing session', async () => {
    const create = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Patch Session', date: '2026-09-03', time: '09:00', location: 'Park' },
    });
    const sessionId = create.body.session.id;

    const patch = await api(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      token: manager.token,
      body: { endTime: '10:30' },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.session.endTime).toMatch(/^10:30/);
  });

  it('clears end_time when patched to null', async () => {
    const create = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Clear Session', date: '2026-09-04', time: '09:00', endTime: '10:00', location: 'Park' },
    });
    const sessionId = create.body.session.id;

    const patch = await api(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      token: manager.token,
      body: { endTime: null },
    });
    expect(patch.status).toBe(200);
    expect(patch.body.session.endTime).toBeNull();
  });

  it('end_time is returned in the sessions list for parents', async () => {
    const create = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Listed Session', date: '2026-09-05', time: '14:00', endTime: '15:00', location: 'Gym' },
    });
    expect(create.status).toBe(201);

    const join = await registerParent(tenant.join_token, {
      parentName: 'End Time Parent',
      contactEmail: 'endtime@example.com',
      kids: [{ name: 'Kid' }],
    });
    const parentToken = join.body.accessToken;

    const list = await api('/api/sessions?from=2026-09-05&to=2026-09-05', { token: parentToken });
    expect(list.status).toBe(200);
    const session = list.body.sessions.find((s: { name: string }) => s.name === 'Listed Session');
    expect(session).toBeDefined();
    expect(session.endTime).toMatch(/^15:00/);
  });
});

// ─── Emoji reactions ──────────────────────────────────────────────────────────

describe('announcement emoji reactions', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentToken: string;
  let parent2Token: string;
  let announcementId: string;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);

    const join1 = await registerParent(tenant.join_token, {
      parentName: 'Reactor One',
      contactEmail: 'reactor-one@example.com',
      kids: [{ name: 'Kid 1' }],
    });
    parentToken = join1.body.accessToken;

    const join2 = await registerParent(tenant.join_token, {
      parentName: 'Reactor Two',
      contactEmail: 'reactor-two@example.com',
      kids: [{ name: 'Kid 2' }],
    });
    parent2Token = join2.body.accessToken;

    const post = await api('/api/announcements', {
      method: 'POST',
      token: manager.token,
      body: { bodyHtml: '<p>Great practice today!</p>' },
    });
    announcementId = post.body.announcement.id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('announcements include an empty reactions array by default', async () => {
    const res = await api('/api/announcements', { token: parentToken });
    expect(res.status).toBe(200);
    const a = res.body.announcements.find((x: { id: string }) => x.id === announcementId);
    expect(a.reactions).toEqual([]);
  });

  it('a parent can add a reaction', async () => {
    const res = await api(`/api/announcements/${announcementId}/reactions`, {
      method: 'POST',
      token: parentToken,
      body: { emoji: '👍' },
    });
    expect(res.status).toBe(201);
  });

  it('reaction count appears for all parents and reactedByMe is true for the reactor', async () => {
    const list1 = await api('/api/announcements', { token: parentToken });
    const a1 = list1.body.announcements.find((x: { id: string }) => x.id === announcementId);
    const r1 = a1.reactions.find((r: { emoji: string }) => r.emoji === '👍');
    expect(r1.count).toBe(1);
    expect(r1.reactedByMe).toBe(true);

    const list2 = await api('/api/announcements', { token: parent2Token });
    const a2 = list2.body.announcements.find((x: { id: string }) => x.id === announcementId);
    const r2 = a2.reactions.find((r: { emoji: string }) => r.emoji === '👍');
    expect(r2.count).toBe(1);
    expect(r2.reactedByMe).toBe(false);
  });

  it('adding the same emoji again is idempotent (no duplicate)', async () => {
    await api(`/api/announcements/${announcementId}/reactions`, {
      method: 'POST',
      token: parentToken,
      body: { emoji: '👍' },
    });
    const list = await api('/api/announcements', { token: parentToken });
    const a = list.body.announcements.find((x: { id: string }) => x.id === announcementId);
    const r = a.reactions.find((r: { emoji: string }) => r.emoji === '👍');
    expect(r.count).toBe(1);
  });

  it('two parents reacting with the same emoji increments the count', async () => {
    await api(`/api/announcements/${announcementId}/reactions`, {
      method: 'POST',
      token: parent2Token,
      body: { emoji: '👍' },
    });
    const list = await api('/api/announcements', { token: parentToken });
    const a = list.body.announcements.find((x: { id: string }) => x.id === announcementId);
    const r = a.reactions.find((r: { emoji: string }) => r.emoji === '👍');
    expect(r.count).toBe(2);
  });

  it('a parent can remove their own reaction', async () => {
    const res = await api(`/api/announcements/${announcementId}/reactions/${encodeURIComponent('👍')}`, {
      method: 'DELETE',
      token: parentToken,
    });
    expect(res.status).toBe(200);

    const list = await api('/api/announcements', { token: parentToken });
    const a = list.body.announcements.find((x: { id: string }) => x.id === announcementId);
    const r = a.reactions.find((r: { emoji: string }) => r.emoji === '👍');
    expect(r.count).toBe(1);
    expect(r.reactedByMe).toBe(false);
  });

  it('removing a non-existent reaction is idempotent (200)', async () => {
    const res = await api(`/api/announcements/${announcementId}/reactions/${encodeURIComponent('❤️')}`, {
      method: 'DELETE',
      token: parentToken,
    });
    expect(res.status).toBe(200);
  });

  it('rejects an emoji not in the allowlist', async () => {
    const res = await api(`/api/announcements/${announcementId}/reactions`, {
      method: 'POST',
      token: parentToken,
      body: { emoji: '🚀' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('managers cannot react — 403', async () => {
    const res = await api(`/api/announcements/${announcementId}/reactions`, {
      method: 'POST',
      token: manager.token,
      body: { emoji: '👍' },
    });
    expect(res.status).toBe(403);
  });
});

// ─── Co-parent invites ────────────────────────────────────────────────────────

describe('co-parent invite — parent-initiated flow', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let p1Token: string;
  let p1KidId: string;
  let inviteToken: string;

  beforeAll(async () => {
    tenant = await createTenant({ name: 'Co-Parent Team' });
    await createManager(tenant.id);

    const join = await registerParent(tenant.join_token, {
      parentName: 'Primary Parent',
      contactEmail: 'primary@example.com',
      kids: [{ name: 'Shared Kid' }],
    });
    p1Token = join.body.accessToken;
    p1KidId = join.body.kids[0].id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('POST /api/co-parent/invite returns an inviteUrl', async () => {
    const res = await api('/api/co-parent/invite', {
      method: 'POST',
      token: p1Token,
    });
    expect(res.status).toBe(201);
    expect(res.body.inviteUrl).toMatch(/\/co-parent-invite\//);
    inviteToken = res.body.inviteUrl.split('/co-parent-invite/')[1];
  });

  it('GET /api/co-parent/invite/:token returns team info', async () => {
    const res = await api(`/api/co-parent/invite/${inviteToken}`);
    expect(res.status).toBe(200);
    expect(res.body.teamName).toBe('Co-Parent Team');
    expect(res.body.teamSlug).toBe(tenant.slug);
  });

  it('GET with a bogus token returns 404', async () => {
    const res = await api('/api/co-parent/invite/not-a-real-token');
    expect(res.status).toBe(404);
  });

  it('accepting the invite creates a new parent in the same family', async () => {
    const res = await api(`/api/co-parent/invite/${inviteToken}/accept`, {
      method: 'POST',
      body: { parentName: 'Second Parent', contactEmail: 'second@example.com' },
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken.startsWith('pat_')).toBe(true);

    const p2Token = res.body.accessToken;
    const me2 = await api('/api/me', { token: p2Token });
    expect(me2.status).toBe(200);
    // Co-parent should see the original parent's kids
    expect(me2.body.kids.map((k: { id: string }) => k.id)).toContain(p1KidId);
  });

  it('the same invite cannot be accepted twice', async () => {
    const res = await api(`/api/co-parent/invite/${inviteToken}/accept`, {
      method: 'POST',
      body: { parentName: 'Third Parent', contactEmail: 'third@example.com' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('co-parent can mark attendance for a kid belonging to the original parent', async () => {
    const manager = await createManager(tenant.id);

    const session = await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'Shared Session', date: '2026-10-01', time: '17:00', location: 'Field' },
    });
    const sessionId = session.body.session.id;

    // Re-accept invite to get co-parent token (previous invite was used)
    // Create a fresh invite from p1
    const invite2 = await api('/api/co-parent/invite', {
      method: 'POST',
      token: p1Token,
    });
    const token2 = invite2.body.inviteUrl.split('/co-parent-invite/')[1];
    const accept2 = await api(`/api/co-parent/invite/${token2}/accept`, {
      method: 'POST',
      body: { parentName: 'Co-Parent 2', contactEmail: 'coparent2@example.com' },
    });
    const p2Token = accept2.body.accessToken;

    const update = await api(`/api/sessions/${sessionId}/attendance`, {
      method: 'PUT',
      token: p2Token,
      body: { updates: [{ kidId: p1KidId, status: 'attending' }] },
    });
    expect(update.status).toBe(200);
  });
});

describe('co-parent invite — manager-initiated flow', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentId: string;
  let parentToken: string;
  let kidId: string;

  beforeAll(async () => {
    tenant = await createTenant({ name: 'Manager Co-Parent Team' });
    manager = await createManager(tenant.id);

    const join = await registerParent(tenant.join_token, {
      parentName: 'Manager-Invited Parent',
      contactEmail: 'mgr-parent@example.com',
      kids: [{ name: 'Kid M' }],
    });
    parentToken = join.body.accessToken;
    parentId = join.body.parent.id;
    kidId = join.body.kids[0].id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('manager can create a co-parent invite for a parent', async () => {
    const res = await api(`/api/team/parents/${parentId}/co-parent-invite`, {
      method: 'POST',
      token: manager.token,
    });
    expect(res.status).toBe(201);
    expect(res.body.inviteUrl).toMatch(/\/co-parent-invite\//);
  });

  it('accepting manager-created invite gives co-parent access to kids', async () => {
    const invite = await api(`/api/team/parents/${parentId}/co-parent-invite`, {
      method: 'POST',
      token: manager.token,
    });
    const inviteToken = invite.body.inviteUrl.split('/co-parent-invite/')[1];

    const accept = await api(`/api/co-parent/invite/${inviteToken}/accept`, {
      method: 'POST',
      body: { parentName: 'Manager Co-Parent', contactEmail: 'mgr-coparent@example.com' },
    });
    expect(accept.status).toBe(201);

    const p2Token = accept.body.accessToken;
    const me2 = await api('/api/me', { token: p2Token });
    expect(me2.status).toBe(200);
    expect(me2.body.kids.map((k: { id: string }) => k.id)).toContain(kidId);
  });

  it('unrelated parent cannot create invite for another parent', async () => {
    const other = await registerParent(tenant.join_token, {
      parentName: 'Other Parent',
      contactEmail: 'other-parent@example.com',
      kids: [{ name: 'Other Kid' }],
    });
    // Parents don't have access to /api/team/parents/:id/co-parent-invite
    const res = await api(`/api/team/parents/${parentId}/co-parent-invite`, {
      method: 'POST',
      token: other.body.accessToken,
    });
    expect(res.status).toBe(403);
  });
});
