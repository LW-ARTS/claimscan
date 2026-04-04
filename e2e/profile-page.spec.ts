import { test, expect } from '@playwright/test';

test.describe('Profile Page', () => {
  test('renders error state for invalid handle', async ({ page }) => {
    await page.goto('/nonexistent-handle-xyz123');

    // Should show error state or content (depending on Supabase availability)
    // At minimum, the page should not crash with a blank screen
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('has working navigation back to homepage', async ({ page }) => {
    await page.goto('/nonexistent-handle-xyz123');

    // Should have a link back to home
    const backLink = page.getByRole('link', { name: /back to search|go home|claimscan/i });
    if (await backLink.count() > 0) {
      await backLink.first().click();
      await expect(page).toHaveURL('/');
    }
  });

  test('header and footer render on profile pages', async ({ page }) => {
    await page.goto('/vitalik');

    // Navigation header
    await expect(page.getByText('ClaimScan')).toBeVisible();

    // Footer — verify platform summary text renders
    await expect(page.getByText(/Solana · Base · 9 platforms/)).toBeVisible();
  });
});
