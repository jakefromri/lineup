import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  WEB_URL,
  TEST_PASSWORD,
  createTenant,
  createManager,
  registerParent,
  cleanupAll,
  randomSuffix,
} from './helpers';

test.describe('announcement feed', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let manager: Awaited<ReturnType<typeof createManager>>;
  let parentToken: string;

  test.beforeAll(async () => {
    tenant = await createTenant({ name: 'E2E Announcements Team' });
    manager = await createManager(tenant.id);

    const join = await registerParent(tenant.join_token, {
      parentName: 'E2E Announcement Parent',
      contactEmail: `e2e-announce-${randomSuffix()}@example.com`,
      kids: [{ name: 'E2E Announce Kid' }],
    });
    parentToken = join.body.accessToken;
  });

  test.afterAll(async () => {
    await cleanupAll();
  });

  test('manager posts a rich-text announcement, parent sees it read-only', async ({ browser }) => {
    // 1. Manager logs in and posts an announcement with bold text.
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await managerPage.goto(`${ADMIN_URL}/login`);
    await managerPage.locator('#email').fill(manager.email);
    await managerPage.locator('#password').fill(TEST_PASSWORD);
    await managerPage.getByRole('button', { name: 'Sign in' }).click();
    await managerPage.waitForURL(`${ADMIN_URL}/manager/calendar`);

    await managerPage.goto(`${ADMIN_URL}/manager/announcements`);
    await managerPage.getByRole('button', { name: 'New announcement' }).click();

    const editor = managerPage.locator('.rich-text[contenteditable="true"]');
    await editor.click();
    await managerPage.keyboard.type('Practice moved to ');
    await managerPage.getByTitle('Bold').click();
    await managerPage.keyboard.type('Field 2');

    await managerPage.getByRole('button', { name: 'Post announcement' }).click();
    await expect(managerPage.getByText(/Practice moved to/)).toBeVisible();
    // Manager view shows edit/delete controls.
    await expect(managerPage.getByTitle('Edit')).toBeVisible();
    await expect(managerPage.getByTitle('Delete')).toBeVisible();

    // 2. Parent loads the announcements feed.
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
    await parentPage.goto(`${WEB_URL}/t/${tenant.slug}/announcements`);

    // 3. Announcement appears with author name, rendered HTML intact (bold
    //    "Field 2"), and no edit/delete controls for the parent.
    await expect(parentPage.getByText(/Practice moved to/)).toBeVisible();
    await expect(parentPage.getByText(manager.email)).toBeVisible();
    await expect(parentPage.locator('.rich-text strong, .rich-text b', { hasText: 'Field 2' })).toBeVisible();
    await expect(parentPage.getByTitle('Edit')).toHaveCount(0);
    await expect(parentPage.getByTitle('Delete')).toHaveCount(0);

    await managerContext.close();
    await parentContext.close();
  });
});
