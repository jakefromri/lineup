import { test, expect } from '@playwright/test';
import { ADMIN_URL, WEB_URL, TEST_PASSWORD, createSuperadmin, cleanupAll, trackTenant, api, randomSuffix } from './helpers';

test.describe('manager onboarding → session creation → parent sees it', () => {
  const slug = `e2e-onboard-${randomSuffix()}`;
  const teamName = 'E2E Onboarding Team';
  const managerEmail = `e2e-manager-${randomSuffix()}@example.com`;
  let superadmin: Awaited<ReturnType<typeof createSuperadmin>>;

  test.beforeAll(async () => {
    superadmin = await createSuperadmin();
  });

  test.afterAll(async () => {
    await cleanupAll();
  });

  test('manager creates a session that the registered parent sees with no_response attendance', async ({ browser }) => {
    // 1. Superadmin logs in and creates a team, capturing the manager invite
    //    and parent join links shown after creation.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${ADMIN_URL}/login`);
    await adminPage.locator('#email').fill(superadmin.email);
    await adminPage.locator('#password').fill(TEST_PASSWORD);
    await adminPage.getByRole('button', { name: 'Sign in' }).click();
    await adminPage.waitForURL(`${ADMIN_URL}/admin/teams`);

    await adminPage.getByRole('button', { name: '+ New team' }).click();
    await adminPage.locator('#name').fill(teamName);
    await adminPage.locator('#slug').fill(slug);
    await adminPage.getByRole('button', { name: 'Create team' }).click();

    const managerInviteUrl = (await adminPage.getByText(/\/accept-invite\//).textContent())!.trim();
    const parentJoinUrl = (await adminPage.getByText(/\/join\//).textContent())!.trim();

    const teamsRes = await api('/api/teams', { token: superadmin.token });
    const team = teamsRes.body.teams.find((t: { slug: string }) => t.slug === slug);
    expect(team).toBeDefined();
    trackTenant(team.id);

    // 2. Manager opens the invite URL, sets a password, and signs in.
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    const acceptPath = managerInviteUrl.slice(managerInviteUrl.indexOf('/accept-invite/'));
    await managerPage.goto(`${ADMIN_URL}${acceptPath}`);
    await managerPage.locator('#email').fill(managerEmail);
    await managerPage.locator('#password').fill(TEST_PASSWORD);
    await managerPage.locator('#confirm-password').fill(TEST_PASSWORD);
    await managerPage.getByRole('button', { name: 'Create account' }).click();
    await managerPage.waitForURL(`${ADMIN_URL}/manager/calendar`);

    // 3. Manager creates a session a few days out (within the 4-week window).
    const sessionDate = new Date();
    sessionDate.setDate(sessionDate.getDate() + 3);
    const dateStr = sessionDate.toISOString().slice(0, 10);

    await managerPage.getByRole('button', { name: 'New session' }).click();
    await managerPage.locator('#s-name').fill('E2E Practice');
    await managerPage.locator('#s-date').fill(dateStr);
    await managerPage.locator('#s-time').fill('17:00');
    await managerPage.locator('#s-location').fill('Field 1');
    await managerPage.getByRole('button', { name: 'Create session' }).click();
    await expect(managerPage.getByText('E2E Practice')).toBeVisible();

    // 4. A parent opens the join link in a separate browser session and registers.
    const parentContext = await browser.newContext();
    const parentPage = await parentContext.newPage();
    const joinPath = parentJoinUrl.slice(parentJoinUrl.indexOf('/join/'));
    await parentPage.goto(`${WEB_URL}${joinPath}`);
    await parentPage.locator('#parent-name').fill('E2E Parent');
    await parentPage.locator('#contact-email').fill('e2e-parent@example.com');
    await parentPage.getByPlaceholder('Kid 1 name').fill('E2E Kid');
    await parentPage.getByRole('button', { name: 'Join team' }).click();
    await parentPage.waitForURL(`${WEB_URL}/t/${slug}/calendar`);

    // 5. The session appears within the default 4-week window, with
    //    no_response attendance for the newly registered kid.
    await expect(parentPage.getByText('E2E Practice')).toBeVisible();
    await expect(parentPage.getByText('E2E Kid')).toBeVisible();

    const kidRow = parentPage.locator('div', { hasText: 'E2E Kid' }).last();
    const noResponseButton = kidRow.getByRole('button', { name: '?' });
    await expect(noResponseButton).toHaveClass(/bg-muted/);

    await adminContext.close();
    await managerContext.close();
    await parentContext.close();
  });
});
