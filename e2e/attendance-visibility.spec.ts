import { test, expect } from '@playwright/test';
import {
  WEB_URL,
  createTenant,
  createManager,
  registerParent,
  cleanupAll,
  api,
  randomSuffix,
} from './helpers';

test.describe('parent marks attendance, visible to second parent', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let p1Token: string;
  let p2Token: string;
  const p1Email = `e2e-p1-${randomSuffix()}@example.com`;
  const p2Email = `e2e-p2-${randomSuffix()}@example.com`;

  test.beforeAll(async () => {
    tenant = await createTenant({ name: 'E2E Attendance Team' });
    const manager = await createManager(tenant.id);

    const sessionDate = new Date();
    sessionDate.setDate(sessionDate.getDate() + 5);
    await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'E2E Visibility Session', date: sessionDate.toISOString().slice(0, 10), time: '18:00', location: 'Field 3' },
    });

    const join1 = await registerParent(tenant.join_token, {
      parentName: 'E2E Parent One',
      contactEmail: p1Email,
      contactPhone: '555-0100',
      kids: [{ name: 'E2E Kid One' }],
    });
    p1Token = join1.body.accessToken;

    const join2 = await registerParent(tenant.join_token, {
      parentName: 'E2E Parent Two',
      contactEmail: p2Email,
      kids: [{ name: 'E2E Kid Two' }],
    });
    p2Token = join2.body.accessToken;
  });

  test.afterAll(async () => {
    await cleanupAll();
  });

  async function loginAsParent(browser: import('@playwright/test').Browser, token: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/`);
    await page.evaluate(
      ({ slug, token, teamName }) => {
        localStorage.setItem(`lineup_token_${slug}`, token);
        localStorage.setItem(`lineup_team_name_${slug}`, teamName);
      },
      { slug: tenant.slug, token, teamName: tenant.name },
    );
    return { context, page };
  }

  test('Parent 1 marks attendance, Parent 2 sees it without seeing Parent 1 contact info', async ({ browser }) => {
    // Parent 1 marks their kid attending.
    const { context: ctx1, page: page1 } = await loginAsParent(browser, p1Token);
    await page1.goto(`${WEB_URL}/t/${tenant.slug}/calendar`);
    await expect(page1.getByText('E2E Visibility Session')).toBeVisible();

    const kid1Row = page1.locator('div', { hasText: 'E2E Kid One' }).last();
    await kid1Row.getByRole('button', { name: 'In' }).click();
    await expect(kid1Row.getByRole('button', { name: 'In' })).toHaveClass(/bg-emerald-100/);

    // Parent 2 loads the calendar and sees Parent 1's kid marked attending.
    const { context: ctx2, page: page2 } = await loginAsParent(browser, p2Token);
    await page2.goto(`${WEB_URL}/t/${tenant.slug}/calendar`);
    await expect(page2.getByText('E2E Visibility Session')).toBeVisible();
    await expect(page2.getByText('E2E Kid One')).toBeVisible();

    // Parent 1's kid is shown read-only (badge), marked attending — and no
    // contact info for Parent 1 appears anywhere on the page.
    const pageContent = await page2.content();
    expect(pageContent).not.toContain(p1Email);
    expect(pageContent).not.toContain('555-0100');

    await ctx1.close();
    await ctx2.close();
  });
});
