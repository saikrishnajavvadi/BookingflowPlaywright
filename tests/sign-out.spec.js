// @ts-check
const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  CREDENTIALS,
  register,
  logout,
  expectLoggedOut,
  expectLoggedIn,
} = require('../utils/helpers');

/**
 * Registers a fresh attendee account and returns credentials for re-login.
 * @param {import('@playwright/test').Page} page
 */
async function registerAttendee(page) {
  const email = `qa.automation.${Date.now()}@example.com`;
  await register(page, email, CREDENTIALS.password);
  return { email, password: CREDENTIALS.password };
}

/**
 * Signs in with explicit credentials.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} password
 */
async function signIn(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#login-btn').click();
  await expectLoggedIn(page);
}

/**
 * Books the first available event for the given attendee email.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 */
async function bookFirstEvent(page, email) {
  await page.goto(`${BASE_URL}/events`);

  const firstCard = page.locator('[data-testid="event-card"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.getByTestId('book-now-btn').click();

  await page.getByLabel('Full Name').fill('QA Automation');
  await page.locator('#customer-email').fill(email);
  await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
  await page.locator('.confirm-booking-btn').click();

  await expect(page.getByText('Booking Confirmed')).toBeVisible();
}

test.describe('Attendee sign-out', () => {
  test('signed-in attendee can sign out and loses access to My Bookings', async ({ page }) => {
    const { email, password } = await registerAttendee(page);

    await test.step('creates a booking while signed in', async () => {
      await bookFirstEvent(page, email);
      await page.getByRole('link', { name: 'View My Bookings' }).click();
      await expect(page).toHaveURL(`${BASE_URL}/bookings`);
      await expect(page.locator('#booking-card').first()).toBeVisible();
    });

    await test.step('signs out from the bookings page', async () => {
      await logout(page);
    });

    await test.step('returns to the public login view', async () => {
      await expectLoggedOut(page);
      await expect(page.getByText('Sign in to EventHub')).toBeVisible();
    });

    await test.step('blocks access to account-only areas until signed in again', async () => {
      await page.goto(`${BASE_URL}/bookings`);
      await expectLoggedOut(page);

      await page.goto(`${BASE_URL}/admin/events`);
      await expectLoggedOut(page);
    });

    await test.step('restores bookings access after signing back in', async () => {
      await signIn(page, email, password);
      await page.goto(`${BASE_URL}/bookings`);
      await expect(page).toHaveURL(`${BASE_URL}/bookings`);
      await expect(page.locator('#booking-card').first()).toBeVisible();
    });
  });

  test('attendee can sign out from the events page', async ({ page }) => {
    await registerAttendee(page);

    await page.goto(`${BASE_URL}/events`);
    await expectLoggedIn(page);

    await logout(page);
    await expectLoggedOut(page);
  });

  test('attendee can sign out from the home page', async ({ page }) => {
    await registerAttendee(page);

    await page.goto(`${BASE_URL}/`);
    await expectLoggedIn(page);

    await logout(page);
    await expectLoggedOut(page);
  });
});
