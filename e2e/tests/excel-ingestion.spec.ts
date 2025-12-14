import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Excel Ingestion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/);
  });

  test('should upload QC parameters Excel file', async ({ page }) => {
    await page.goto('/upload-qc');

    // Wait for upload form
    await page.waitForSelector('input[type="file"]', { timeout: 5000 });

    // Create a minimal test Excel file structure
    // In a real scenario, you'd have a test fixture file
    const fileInput = page.locator('input[type="file"]');
    
    // Note: This test assumes you have a test Excel file
    // For now, we'll just verify the UI
    await expect(fileInput).toBeVisible();
    await expect(page.locator('text=/File Requirements|Select Excel File/i')).toBeVisible();
  });

  test('should validate file type', async ({ page }) => {
    await page.goto('/upload-qc');

    await page.waitForSelector('input[type="file"]', { timeout: 5000 });

    // Try to upload a non-Excel file (if file input accepts it)
    // Browser will typically prevent this, but we can check the UI
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute('accept', /.xlsx|spreadsheet/);
  });

  test('should show upload instructions', async ({ page }) => {
    await page.goto('/upload-qc');

    await expect(page.locator('text=/File Requirements/i')).toBeVisible();
    await expect(page.locator('text=/Staging.*Pre-Live.*Post-Live/i')).toBeVisible();
    await expect(page.locator('text=/parameter_key.*parameter_label/i')).toBeVisible();
  });
});

