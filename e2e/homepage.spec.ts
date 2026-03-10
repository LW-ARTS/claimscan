import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('renders hero section with heading and search bar', async ({ page }) => {
    await page.goto('/');

    // Main heading visible
    await expect(page.getByText('Track your')).toBeVisible();

    // Search bar present
    const searchInput = page.getByPlaceholder(/search.*handle/i);
    await expect(searchInput).toBeVisible();

    // SCAN button present
    await expect(page.getByRole('button', { name: /scan/i })).toBeVisible();
  });

  test('displays platform pills with correct count', async ({ page }) => {
    await page.goto('/');

    // All platform pills should be present
    const platforms = ['Bags.fm', 'Clanker', 'Pump.fun', 'Zora', 'Bankr', 'Believe', 'RevShare'];
    for (const name of platforms) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test('displays stats strip with launchpad count', async ({ page }) => {
    await page.goto('/');

    // Stats strip values
    await expect(page.getByText('8')).toBeVisible();
    await expect(page.getByText('Launchpads')).toBeVisible();
    await expect(page.getByText('Chains')).toBeVisible();
    await expect(page.getByText('Live')).toBeVisible();
  });

  test('search navigates to profile page', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder(/search.*handle/i);
    await searchInput.fill('vitalik');
    await searchInput.press('Enter');

    // Should navigate to profile URL
    await expect(page).toHaveURL(/\/vitalik/);
  });
});
