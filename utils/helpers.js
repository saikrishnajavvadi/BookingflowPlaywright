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
 * Logs in and confirms success via the "Browse Events →" link.
 * @param {import('@playwright/test').Page} page
 */
async function login(page) {
  await page.goto(`${BASE_URL}/login`);

  // Email field located by its placeholder.
  await page.getByPlaceholder('you@email.com').fill(CREDENTIALS.email);
  // Password field located by its label.
  await page.getByLabel('Password').fill(CREDENTIALS.password);
  // Login button located by id.
  await page.locator('#login-btn').click();

  // Success assertion: the "Browse Events →" link becomes visible.
  await expect(page.getByRole('link', { name: /Browse Events/ })).toBeVisible();
}

/**
 * Logs in and confirms the "Browse Events →" link is visible.
 * Thin wrapper around login() to match the helper name used by the refund tests.
 * @param {import('@playwright/test').Page} page
 */
async function loginAndGoToBooking(page) {
  await login(page);
  await expect(page.getByRole('link', { name: /Browse Events/ })).toBeVisible();
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
  login,
  loginAndGoToBooking,
  clientLogin,
};
