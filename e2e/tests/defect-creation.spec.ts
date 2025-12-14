import { test, expect } from '@playwright/test';

test.describe('Defect Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test('should create a new defect', async ({ page }) => {
    await page.goto('/defects');
    await page.click('text=New Defect');

    // Wait for form to load
    await page.waitForSelector('input[name="title"]', { timeout: 5000 });

    // Fill in defect form
    await page.fill('input[name="title"]', 'E2E Test Defect');
    await page.fill('textarea[name="description"]', 'This is a test defect created by E2E tests');
    
    // Select project (assuming at least one project exists)
    const projectSelect = page.locator('select[name="projectId"]');
    await projectSelect.waitFor({ state: 'visible' });
    const options = await projectSelect.locator('option').count();
    if (options > 1) {
      await projectSelect.selectOption({ index: 1 });
    }

    // Select status
    await page.selectOption('select[name="status"]', 'OPEN');
    
    // Select priority
    await page.selectOption('select[name="priority"]', '3');

    // Submit form
    await page.click('button[type="submit"]');

    // Should redirect to defect detail page
    await page.waitForURL(/\/defects\/[^/]+/, { timeout: 10000 });
    await expect(page.locator('text=E2E Test Defect')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/defects/new');

    await page.waitForSelector('input[name="title"]', { timeout: 5000 });

    // Try to submit without filling required fields
    await page.click('button[type="submit"]');

    // Browser validation should prevent submission
    const titleInput = page.locator('input[name="title"]');
    await expect(titleInput).toHaveAttribute('required', '');
  });
});

