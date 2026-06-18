// @ts-check
const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  CREDENTIALS,
  register,
  logout,
  expectLoggedIn,
} = require('../utils/helpers');

/** Opens the EventHub registration page. */
async function openRegistrationForm(page) {
  await page.goto(`${BASE_URL}/register`);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
}

/**
 * Fills the registration form fields.
 * @param {import('@playwright/test').Page} page
 * @param {{ email?: string, password?: string, confirmPassword?: string }} fields
 */
async function fillRegistrationForm(page, { email = '', password = '', confirmPassword = '' } = {}) {
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.getByPlaceholder('Repeat your password').fill(confirmPassword);
}

/** Submits the registration form without waiting for navigation. */
async function submitRegistration(page) {
  await page.locator('#register-btn').click();
}

/** Locator for visible inline validation messages on the registration form. */
function registrationErrors(page) {
  return page.locator('p.text-red-600');
}

test.describe('EventHub visitor registration', () => {
  test('visitor can open the registration form and enter email and password', async ({ page }) => {
    const email = `qa.automation.${Date.now()}@example.com`;

    await openRegistrationForm(page);

    await expect(page.locator('#register-email')).toBeVisible();
    await expect(page.locator('#register-password')).toBeVisible();
    await expect(page.getByPlaceholder('Repeat your password')).toBeVisible();
    await expect(page.locator('#register-btn')).toHaveText('Create Account');

    await fillRegistrationForm(page, {
      email,
      password: CREDENTIALS.password,
      confirmPassword: CREDENTIALS.password,
    });

    await expect(page.locator('#register-email')).toHaveValue(email);
    await expect(page.locator('#register-password')).toHaveValue(CREDENTIALS.password);
  });

  test('validates email format and password minimum requirements', async ({ page }) => {
    await openRegistrationForm(page);

    await fillRegistrationForm(page, {
      email: 'not-an-email',
      password: 'weak',
      confirmPassword: 'weak',
    });
    await submitRegistration(page);

    await expect(page).toHaveURL(`${BASE_URL}/register`);
    await expect(registrationErrors(page)).toContainText([
      'Enter a valid email',
      'Password does not meet the requirements below',
    ]);
  });

  test('prevents registering with an email that already has an account', async ({ page }) => {
    const email = `qa.automation.dup.${Date.now()}@example.com`;

    await register(page, email, CREDENTIALS.password);
    await logout(page);

    await openRegistrationForm(page);
    await fillRegistrationForm(page, {
      email,
      password: CREDENTIALS.password,
      confirmPassword: CREDENTIALS.password,
    });
    await submitRegistration(page);

    await expect(page).toHaveURL(`${BASE_URL}/register`);
    await expect(page.getByText('Email already registered')).toBeVisible();
    await expect(page.getByTestId('logout-btn')).toBeHidden();
  });

  test('creates an account and grants access to booking features on success', async ({ page }) => {
    const email = `qa.automation.${Date.now()}@example.com`;

    await register(page, email, CREDENTIALS.password);

    await expect(page.getByRole('link', { name: /Browse Events/ }).first()).toBeVisible();
    await expectLoggedIn(page);

    await page.goto(`${BASE_URL}/events`);
    await expect(page).toHaveURL(`${BASE_URL}/events`);
    await expect(page.getByTestId('nav-bookings')).toBeVisible();

    const firstCard = page.locator('[data-testid="event-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.getByTestId('book-now-btn').click();
      await expect(page.getByLabel('Full Name')).toBeVisible();
      await expect(page.locator('#customer-email')).toBeVisible();
    }
  });

  test('flags required fields left blank before creating an account', async ({ page }) => {
    await openRegistrationForm(page);
    await submitRegistration(page);

    await expect(page).toHaveURL(`${BASE_URL}/register`);
    await expect(registrationErrors(page)).toContainText([
      'Enter a valid email',
      'Password does not meet the requirements below',
    ]);
    await expect(page.getByTestId('logout-btn')).toBeHidden();
  });

  test('flags mismatched passwords before creating an account', async ({ page }) => {
    await openRegistrationForm(page);
    await fillRegistrationForm(page, {
      email: `qa.automation.${Date.now()}@example.com`,
      password: CREDENTIALS.password,
      confirmPassword: 'Different@456',
    });
    await submitRegistration(page);

    await expect(page).toHaveURL(`${BASE_URL}/register`);
    await expect(registrationErrors(page)).toContainText('Passwords do not match');
  });
});
