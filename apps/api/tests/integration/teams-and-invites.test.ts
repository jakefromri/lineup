import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, cleanupAll, createTenant, createManager, createSuperadmin, createApiKey, trackTenant } from '../helpers.js';

describe('team bootstrap is atomic', () => {
  let superadmin: Awaited<ReturnType<typeof createSuperadmin>>;
  const createdSlug = `bootstrap-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    superadmin = await createSuperadmin();
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('POST /api/teams creates the team and a pending manager invite, returning both URLs', async () => {
    const res = await api('/api/teams', {
      method: 'POST',
      token: superadmin.token,
      body: { name: 'Bootstrap Team', slug: createdSlug },
    });

    expect(res.status).toBe(201);
    expect(res.body.team.slug).toBe(createdSlug);
    expect(typeof res.body.managerInviteUrl).toBe('string');
    expect(typeof res.body.parentJoinUrl).toBe('string');
    expect(res.body.managerInviteUrl).toContain('/accept-invite/');
    expect(res.body.parentJoinUrl).toContain('/join/');

    trackTenant(res.body.team.id);
  });

  it('rejects a duplicate slug with 409 and creates no second team', async () => {
    const res = await api('/api/teams', {
      method: 'POST',
      token: superadmin.token,
      body: { name: 'Duplicate Slug Team', slug: createdSlug },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');

    const list = await api('/api/teams', { token: superadmin.token });
    const matches = list.body.teams.filter((t: { slug: string }) => t.slug === createdSlug);
    expect(matches).toHaveLength(1);
  });
});

describe('manager invite acceptance', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let superadmin: Awaited<ReturnType<typeof createSuperadmin>>;
  let inviteToken: string;

  beforeAll(async () => {
    superadmin = await createSuperadmin();

    const res = await api('/api/teams', {
      method: 'POST',
      token: superadmin.token,
      body: { name: 'Invite Team', slug: `invite-${Math.random().toString(36).slice(2, 10)}` },
    });
    tenant = res.body.team;
    trackTenant(tenant.id);

    const url: string = res.body.managerInviteUrl;
    inviteToken = url.split('/accept-invite/')[1];
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('rejects a password shorter than 10 characters with 400, membership unchanged', async () => {
    const res = await api(`/api/invites/${inviteToken}/accept`, {
      method: 'POST',
      body: { email: 'weak-password@example.com', password: 'short1' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('accepts a valid invite, creating a scoped manager account', async () => {
    const res = await api(`/api/invites/${inviteToken}/accept`, {
      method: 'POST',
      body: { email: `accepted-${Math.random().toString(36).slice(2, 8)}@example.com`, password: 'a-strong-password' },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects re-accepting the same invite token with 409', async () => {
    const res = await api(`/api/invites/${inviteToken}/accept`, {
      method: 'POST',
      body: { email: 'second-attempt@example.com', password: 'another-strong-password' },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });
});

describe('cannot remove last manager', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('DELETE /api/team/managers/:membershipId returns 409 for the sole manager', async () => {
    const res = await api(`/api/team/managers/${manager.membershipId}`, {
      method: 'DELETE',
      token: manager.token,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');

    // Membership is unchanged — manager can still authenticate.
    const team = await api('/api/team', { token: manager.token });
    expect(team.status).toBe(200);
  });

  it('allows removing a manager once a second accepted manager exists', async () => {
    const second = await createManager(tenant.id);

    const res = await api(`/api/team/managers/${manager.membershipId}`, {
      method: 'DELETE',
      token: second.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('API key regeneration invalidates old key', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let oldKey: string;

  beforeAll(async () => {
    tenant = await createTenant();
    manager = await createManager(tenant.id);
    oldKey = await createApiKey(tenant.id);
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it('old key works before regeneration', async () => {
    const res = await api('/api/sessions', { token: oldKey });
    expect(res.status).toBe(200);
  });

  it('regenerating returns a new key and invalidates the old one', async () => {
    const regen = await api('/api/team/api-key/regenerate', { method: 'POST', token: manager.token });
    expect(regen.status).toBe(200);
    const newKey: string = regen.body.apiKey;
    expect(newKey.startsWith('sk_')).toBe(true);
    expect(newKey).not.toBe(oldKey);

    const oldRes = await api('/api/sessions', { token: oldKey });
    expect(oldRes.status).toBe(401);

    const newRes = await api('/api/sessions', { token: newKey });
    expect(newRes.status).toBe(200);
  });
});
