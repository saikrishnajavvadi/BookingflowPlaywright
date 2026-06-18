// @ts-check
const { test, expect } = require('@playwright/test');
const { CLIENT_BASE_URL, CLIENT_CREDENTIALS, clientLogin } = require('../utils/helpers');

test.describe('Let\'s Shop client login', () => {
  test('logs in with valid credentials and lands on the dashboard', async ({ page }) => {
    await page.goto(`${CLIENT_BASE_URL}/#/auth/login`);

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.locator('#userEmail')).toBeVisible();
    await expect(page.locator('#userPassword')).toBeVisible();
    await expect(page.locator('#login')).toBeVisible();

    await page.locator('#userEmail').fill(CLIENT_CREDENTIALS.email);
    await page.locator('#userPassword').fill(CLIENT_CREDENTIALS.password);
    await page.locator('#login').click();

    await expect(page).toHaveURL(/\/dashboard\/dash/);
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
    await expect(page.getByText('Automation Practice')).toBeVisible();
  });

  test('reuses the clientLogin helper to reach the dashboard', async ({ page }) => {
    await clientLogin(page);
    await expect(page.getByRole('button', { name: 'HOME' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ORDERS' })).toBeVisible();
  });
});
