import { test, expect } from '@playwright/test';
import { WEB_URL, createTenant, createManager, registerParent, cleanupAll, api, randomSuffix } from './helpers';

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

test.describe('calendar pagination beyond 4 weeks', () => {
  let tenant: Awaited<ReturnType<typeof createTenant>>;
  let parentToken: string;

  test.beforeAll(async () => {
    tenant = await createTenant({ name: 'E2E Pagination Team' });
    const manager = await createManager(tenant.id);

    // Within the initial 4-week (28-day) window.
    await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'E2E Near Session', date: isoDate(10), time: '17:00', location: 'Near Field' },
    });

    // In weeks 5-8, outside the initial window.
    await api('/api/sessions', {
      method: 'POST',
      token: manager.token,
      body: { name: 'E2E Far Session', date: isoDate(40), time: '17:00', location: 'Far Field' },
    });

    const join = await registerParent(tenant.join_token, {
      parentName: 'E2E Pagination Parent',
      contactEmail: `e2e-pagination-${randomSuffix()}@example.com`,
      kids: [{ name: 'E2E Pagination Kid' }],
    });
    parentToken = join.body.accessToken;
  });

  test.afterAll(async () => {
    await cleanupAll();
  });

  test('initial view shows only the next 4 weeks; later sessions load on pagination', async ({ page }) => {
    await page.goto(`${WEB_URL}/`);
    await page.evaluate(
      ({ slug, token, teamName }) => {
        localStorage.setItem(`lineup_token_${slug}`, token);
        localStorage.setItem(`lineup_team_name_${slug}`, teamName);
      },
      { slug: tenant.slug, token: parentToken, teamName: tenant.name },
    );
    await page.goto(`${WEB_URL}/t/${tenant.slug}/calendar`);

    // Initial 4-week window shows the near session, not the far one.
    await expect(page.getByText('E2E Near Session')).toBeVisible();
    await expect(page.getByText('E2E Far Session')).not.toBeVisible();

    // Paginate forward (next 28-day range) — the far session becomes visible,
    // the near one scrolls out of the current window. The forward-range
    // control is the rightmost icon-only button in the range header
    // (ChevronLeft / Today / ChevronRight).
    await page.getByTestId('range-next').click();

    await expect(page.getByText('E2E Far Session')).toBeVisible();
    await expect(page.getByText('E2E Near Session')).not.toBeVisible();
  });
});
