import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('renders hero section with heading and search bar', async ({ page }) => {
    await page.goto('/');

    // Hero renders "Track your" visible span + sr-only h1. `.first()` accepts either ordering.
    await expect(page.getByText('Track your').first()).toBeVisible();

    // Search bar present (redesign may render hero + sticky duplicates).
    const searchInput = page.getByPlaceholder(/@handle/i).first();
    await expect(searchInput).toBeVisible();

    // SCAN button present
    await expect(page.getByRole('button', { name: /scan/i }).first()).toBeVisible();
  });

  test('displays platform pills with correct count', async ({ page }) => {
    await page.goto('/');

    // Marquee duplicates each row for infinite scroll, so each platform name appears 2-4x.
    const platforms = ['Bags.fm', 'Clanker', 'Pump.fun', 'Zora', 'Bankr', 'Believe', 'RevShare'];
    for (const name of platforms) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  test('displays stats strip with launchpad count', async ({ page }) => {
    await page.goto('/');

    // Launchpad count renders in hero subtitle + sr-only h1 (dynamic from SHIPPED_LAUNCHPAD_COUNT)
    await expect(page.getByText('10 launchpads').first()).toBeVisible();

    // Stats strip cards
    await expect(page.getByText('Fees Tracked').first()).toBeVisible();
    await expect(page.getByText('Wallets Scanned').first()).toBeVisible();
  });

  // Search form submit flow is flaky in e2e because router.push() runs inside a client
  // callback gated on hydration + Turnstile readiness, and the test env doesn't ship a
  // real Turnstile widget. Covered by unit + manual QA against the deployed preview.
  test.skip('search navigates to profile page', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const searchInput = page.getByPlaceholder(/@handle/i).first();
    await searchInput.fill('vitalik');
    await page.getByRole('button', { name: /scan/i }).first().click();

    await expect(page).toHaveURL(/\/vitalik/, { timeout: 10_000 });
  });
});
