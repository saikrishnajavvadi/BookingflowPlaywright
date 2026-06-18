// @ts-check
const { expect } = require('@playwright/test');

/** Base URL for the EventHub application under test. */
const BASE_URL = 'https://eventhub.rahulshettyacademy.com';

/** Base URL for the Let's Shop (client) e-commerce application. */
const CLIENT_BASE_URL = 'https://rahulshettyacademy.com/client';

/**
 * Credentials for the Let's Shop client app. Register an account at
 * https://rahulshettyacademy.com/client/#/auth/register, then set
 * CLIENT_EMAIL / CLIENT_PASSWORD in your shell (or CI secrets).
 */
const CLIENT_CREDENTIALS = {
  email: process.env.CLIENT_EMAIL || 'qa.automation@example.com',
  password: process.env.CLIENT_PASSWORD || 'Password@123',
};

/**
 * Credentials. The task says "create your own credentials", so these are
 * configurable via environment variables and fall back to placeholder values.
 * Set EVENTHUB_EMAIL / EVENTHUB_PASSWORD in your shell (or a .env) before running,
 * or register an account on the site and drop the values in here.
 */
const CREDENTIALS = {
  email: process.env.EVENTHUB_EMAIL || 'qa.automation@example.com',
  password: process.env.EVENTHUB_PASSWORD || 'Password@123',
};

/**
 * Returns a value suitable for an <input type="datetime-local"> a number of
 * days in the future, formatted as YYYY-MM-DDTHH:mm.
 * @param {number} daysAhead
 * @returns {string}
 */
function futureDateValue(daysAhead = 30) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Reads the seat count from an event card by finding the element that mentions
 * "seat" and parsing the first integer out of its text.
 * @param {import('@playwright/test').Locator} card
 * @returns {Promise<number>}
 */
async function readSeatCount(card) {
  const seatEl = card.getByText(/seat/i).first();
  const text = await seatEl.innerText();
  const match = text.match(/\d+/);
  if (!match) {
    throw new Error(`Could not parse a seat count from text: "${text}"`);
  }
  return parseInt(match[0], 10);
}

/**
 * Registers a new EventHub account and waits for the home page.
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 * @param {string} [password]
 */
async function register(page, email, password = CREDENTIALS.password) {
  await page.goto(`${BASE_URL}/register`);
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.getByPlaceholder('Repeat your password').fill(password);
  await page.locator('#register-btn').click();
  await expect(page.getByRole('link', { name: /Browse Events/ }).first()).toBeVisible();
}

/**
 * Logs in and confirms success via the "Browse Events →" link.
 * Falls back to registering a fresh account when stored credentials are invalid.
 * @param {import('@playwright/test').Page} page
 */
async function login(page) {
  await page.goto(`${BASE_URL}/login`);

  await page.getByPlaceholder('you@email.com').fill(CREDENTIALS.email);
  await page.locator('#password').fill(CREDENTIALS.password);
  await page.locator('#login-btn').click();

  const browseEvents = page.getByRole('link', { name: /Browse Events/ }).first();
  const loggedIn = await browseEvents
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!loggedIn) {
    const email = `qa.automation.${Date.now()}@example.com`;
    await register(page, email);
  }
}

/**
 * Logs in and confirms the "Browse Events →" link is visible.
 * Thin wrapper around login() to match the helper name used by the refund tests.
 * @param {import('@playwright/test').Page} page
 */
async function loginAndGoToBooking(page) {
  await login(page);
  await expect(page.getByRole('link', { name: /Browse Events/ }).first()).toBeVisible();
}

/**
 * Signs out the current attendee and confirms the login page is shown.
 * @param {import('@playwright/test').Page} page
 */
async function logout(page) {
  await page.getByTestId('logout-btn').click();
  await expect(page).toHaveURL(`${BASE_URL}/login`);
  await expect(page.locator('#login-btn')).toBeVisible();
}

/**
 * Asserts the attendee is signed out and on the public login view.
 * @param {import('@playwright/test').Page} page
 */
async function expectLoggedOut(page) {
  await expect(page).toHaveURL(`${BASE_URL}/login`);
  await expect(page.locator('#login-btn')).toBeVisible();
  await expect(page.getByTestId('logout-btn')).toBeHidden();
}

/**
 * Asserts the attendee is signed in with access to account navigation.
 * @param {import('@playwright/test').Page} page
 */
async function expectLoggedIn(page) {
  await expect(page.getByTestId('logout-btn')).toBeVisible();
  await expect(page.getByTestId('nav-bookings')).toBeVisible();
}

/**
 * Logs into the Let's Shop client app and confirms the dashboard loads.
 * @param {import('@playwright/test').Page} page
 */
async function clientLogin(page) {
  await page.goto(`${CLIENT_BASE_URL}/#/auth/login`);

  await page.locator('#userEmail').fill(CLIENT_CREDENTIALS.email);
  await page.locator('#userPassword').fill(CLIENT_CREDENTIALS.password);
  await page.locator('#login').click();

  await expect(page).toHaveURL(/\/dashboard\/dash/);
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
}

module.exports = {
  BASE_URL,
  CLIENT_BASE_URL,
  CREDENTIALS,
  CLIENT_CREDENTIALS,
  futureDateValue,
  readSeatCount,
  register,
  login,
  loginAndGoToBooking,
  logout,
  expectLoggedOut,
  expectLoggedIn,
  clientLogin,
};
