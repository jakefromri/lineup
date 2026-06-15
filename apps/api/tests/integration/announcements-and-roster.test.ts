import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, cleanupAll, createTenant, createManager, registerParent } from '../helpers.js';

describe('announcement CRUD and authorship snapshot', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let m1: Awaited<ReturnType<typeof createManager>>;
  let m2: Awaited<ReturnType<typeof createManager>>;
  let announcementId: string;

  beforeAll(async () => {
    tenant = await createTenant();
    m1 = await createManager(tenant.id);
    m2 = await createManager(tenant.id);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('creates an announcement authored by M1', async () => {
    const res = await api('/api/announcements', {
      method: 'POST',
      token: m1.token,
      body: { bodyHtml: '<p>Practice moved to Field 2 this week.</p>' },
    });
    expect(res.status).toBe(201);
    expect(res.body.announcement.authorName).toBe(m1.email);
    announcementId = res.body.announcement.id;
  });

  it('updates the announcement, marking it edited', async () => {
    const res = await api(`/api/announcements/${announcementId}`, {
      method: 'PATCH',
      token: m1.token,
      body: { bodyHtml: '<p>Practice moved to Field 2 this week (updated).</p>' },
    });
    expect(res.status).toBe(200);
    expect(res.body.announcement.updatedAt).not.toBe(res.body.announcement.createdAt);
  });

  it('still shows M1’s name as author after M1 is removed from the team', async () => {
    const remove = await api(`/api/team/managers/${m1.membershipId}`, {
      method: 'DELETE',
      token: m2.token,
    });
    expect(remove.status).toBe(200);

    const res = await api('/api/announcements', { token: m2.token });
    expect(res.status).toBe(200);
    const announcement = res.body.announcements.find((a: { id: string }) => a.id === announcementId);
    expect(announcement).toBeDefined();
    expect(announcement.authorName).toBe(m1.email);
  });

  it('M2 can delete the announcement', async () => {
    const res = await api(`/api/announcements/${announcementId}`, {
      method: 'DELETE',
      token: m2.token,
    });
    expect(res.status).toBe(200);

    const list = await api('/api/announcements', { token: m2.token });
    expect(list.body.announcements.map((a: { id: string }) => a.id)).not.toContain(announcementId);
  });
});

describe('empty announcement body rejected', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('rejects whitespace-only HTML with 400 and creates nothing', async () => {
    const res = await api('/api/announcements', {
      method: 'POST',
      token: manager.token,
      body: { bodyHtml: '<p>   </p>' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');

    const list = await api('/api/announcements', { token: manager.token });
    expect(list.body.announcements).toHaveLength(0);
  });
});

describe('roster does not leak across teams, and respects manager-vs-parent visibility', () => {
  let teamA: Awaited<ReturnType<typeof createTenant>>;
  let teamB: Awaited<ReturnType<typeof createTenant>>;
  let managerA: Awaited<ReturnType<typeof createManager>>;
  let managerB: Awaited<ReturnType<typeof createManager>>;
  let parentAToken: string;

  beforeAll(async () => {
    teamA = await createTenant({ name: 'Roster Team A' });
    teamB = await createTenant({ name: 'Roster Team B' });
    managerA = await createManager(teamA.id);
    managerB = await createManager(teamB.id);

    const joinA = await registerParent(teamA.join_token, {
      parentName: 'Roster Parent A',
      contactEmail: 'roster-parent-a@example.com',
      contactPhone: '555-0001',
      kids: [{ name: 'Roster Kid A' }],
    });
    parentAToken = joinA.body.accessToken;

    await registerParent(teamB.join_token, {
      parentName: 'Roster Parent B',
      contactEmail: 'roster-parent-b@example.com',
      kids: [{ name: 'Roster Kid B' }],
    });
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('manager A sees Team A parents with contact info, not Team B parents', async () => {
    const res = await api('/api/roster', { token: managerA.token });
    expect(res.status).toBe(200);
    const names = res.body.parents.map((p: { name: string }) => p.name);
    expect(names).toContain('Roster Parent A');
    expect(names).not.toContain('Roster Parent B');

    const parentA = res.body.parents.find((p: { name: string }) => p.name === 'Roster Parent A');
    expect(parentA.contactEmail).toBe('roster-parent-a@example.com');
    expect(parentA.contactPhone).toBe('555-0001');
    expect(parentA.kids.map((k: { name: string }) => k.name)).toContain('Roster Kid A');
  });

  it('manager B does not see Team A in their roster', async () => {
    const res = await api('/api/roster', { token: managerB.token });
    expect(res.status).toBe(200);
    expect(res.body.parents.map((p: { name: string }) => p.name)).not.toContain('Roster Parent A');
  });

  it('a parent never sees contact info via /api/sessions or /api/announcements', async () => {
    await api('/api/announcements', {
      method: 'POST',
      token: managerA.token,
      body: { bodyHtml: '<p>Welcome to the season!</p>' },
    });

    const sessions = await api('/api/sessions', { token: parentAToken });
    expect(sessions.status).toBe(200);
    expect(JSON.stringify(sessions.body)).not.toContain('roster-parent-a@example.com');
    expect(JSON.stringify(sessions.body)).not.toContain('555-0001');

    const announcements = await api('/api/announcements', { token: parentAToken });
    expect(announcements.status).toBe(200);
    expect(JSON.stringify(announcements.body)).not.toContain('roster-parent-a@example.com');
    expect(JSON.stringify(announcements.body)).not.toContain('555-0001');
  });
});
