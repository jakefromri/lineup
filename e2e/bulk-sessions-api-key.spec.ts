import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  WEB_URL,
  TEST_PASSWORD,
  createTenant,
  createManager,
  registerParent,
  cleanupAll,
  api,
  randomSuffix,
} from './helpers';

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

test.describe('Claude-driven bulk session creation via API key', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentToken: string;
  const sessionNames = ['E2E Bulk Session 1', 'E2E Bulk Session 2', 'E2E Bulk Session 3'];

  test.beforeAll(async () => {
    tenant = await createTenant({ name: 'E2E Bulk API Team' });
    manager = await createManager(tenant.id);

    const join = await registerParent(tenant.join_token, {
      parentName: 'E2E Bulk Parent',
      contactEmail: `e2e-bulk-${randomSuffix()}@example.com`,
      kids: [{ name: 'E2E Bulk Kid' }],
    });
    parentToken = join.body.accessToken;
  });

  test.afterAll(async () => {
    await cleanupAll();
  });

  test('manager generates an API key; bulk-created sessions appear for manager and parent; key is session-scoped only', async ({ browser }) => {
    // 1. Manager logs in, navigates to team settings, generates an API key.
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await managerPage.goto(`${ADMIN_URL}/login`);
    await managerPage.locator('#email').fill(manager.email);
    await managerPage.locator('#password').fill(TEST_PASSWORD);
    await managerPage.getByRole('button', { name: 'Sign in' }).click();
    await managerPage.waitForURL(`${ADMIN_URL}/manager/calendar`);

    await managerPage.goto(`${ADMIN_URL}/manager/team`);
    await managerPage.getByRole('button', { name: /Generate key|Regenerate key/ }).click();

    await expect(managerPage.getByText("New API key generated")).toBeVisible();
    const apiKey = await managerPage.locator('input[readonly]').last().inputValue();
    expect(apiKey.startsWith('sk_')).toBe(true);

    // 2. "Claude" bulk-creates a season of sessions using the API key.
    for (let i = 0; i < sessionNames.length; i++) {
      const res = await api('/api/sessions', {
        method: 'POST',
        token: apiKey,
        body: { name: sessionNames[i], date: isoDate(7 * (i + 1)), time: '16:00', location: `Field ${i + 1}` },
      });
      expect(res.status).toBe(201);
    }

    // 3. All sessions appear on the manager's calendar.
    await managerPage.goto(`${ADMIN_URL}/manager/calendar`);
    for (const name of sessionNames) {
      await expect(managerPage.getByText(name)).toBeVisible();
    }

    // 4. All sessions appear on the parent's calendar.
    const parentContext = await browser.newContext();
    const parentPage = await parentContext.newPage();
    await parentPage.goto(`${WEB_URL}/`);
    await parentPage.evaluate(
      ({ slug, token, teamName }) => {
        localStorage.setItem(`lineup_token_${slug}`, token);
        localStorage.setItem(`lineup_team_name_${slug}`, teamName);
      },
      { slug: tenant.slug, token: parentToken, teamName: tenant.name },
    );
    await parentPage.goto(`${WEB_URL}/t/${tenant.slug}/calendar`);
    for (const name of sessionNames) {
      await expect(parentPage.getByText(name)).toBeVisible();
    }

    // 5. The API key is scoped to session create/update/delete only.
    const rosterRes = await api('/api/roster', { token: apiKey });
    expect(rosterRes.status).toBe(403);
    expect(rosterRes.body.error.code).toBe('role_mismatch');

    await managerContext.close();
    await parentContext.close();
  });
});
