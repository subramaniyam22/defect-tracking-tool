import { test, expect } from '@playwright/test';

test.describe('Dashboard Filters', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test('should filter by project', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for filters to load
    await page.waitForSelector('select', { timeout: 5000 });

    // Select a project from filter
    const projectSelect = page.locator('select').first();
    await projectSelect.selectOption({ index: 1 }); // Select first non-empty option

    // Wait for metrics to update
    await page.waitForTimeout(1000);

    // Verify metrics are displayed
    await expect(page.locator('text=Total Defects')).toBeVisible();
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/dashboard');

    await page.waitForSelector('select', { timeout: 5000 });

    // Find status filter (usually second or third select)
    const statusSelect = page.locator('select').nth(1);
    if (await statusSelect.count() > 0) {
      await statusSelect.selectOption('OPEN');
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Total Defects')).toBeVisible();
    }
  });

  test('should filter by date range', async ({ page }) => {
    await page.goto('/dashboard');

    await page.waitForSelector('input[type="date"]', { timeout: 5000 });

    const startDate = page.locator('input[type="date"]').first();
    const endDate = page.locator('input[type="date"]').last();

    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await startDate.fill(lastWeek);
    await endDate.fill(today);

    await page.waitForTimeout(1000);
    await expect(page.locator('text=Total Defects')).toBeVisible();
  });
});

