// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE_URL, CREDENTIALS, loginAndGoToBooking } = require('../utils/helpers');

/**
 * Books the very first event on /events.
 * @param {import('@playwright/test').Page} page
 * @param {number} extraTickets number of times to click "+" (0 => 1 ticket)
 */
async function bookFirstEvent(page, extraTickets = 0) {
  await page.goto(`${BASE_URL}/events`);

  const firstCard = page.locator('[data-testid="event-card"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.getByTestId('book-now-btn').click();

  // Increase the quantity if requested (Test 2 => 3 tickets).
  for (let i = 0; i < extraTickets; i++) {
    await page.locator('button:has-text("+")').click();
  }

  await page.getByLabel('Full Name').fill('QA Automation');
  await page.locator('#customer-email').fill(CREDENTIALS.email);
  await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
  await page.locator('.confirm-booking-btn').click();
}

/**
 * From the confirmation, opens the booking detail page and validates header,
 * then runs the refund eligibility check (spinner appears then disappears).
 * Returns the #refund-result locator for result-specific assertions.
 * @param {import('@playwright/test').Page} page
 */
async function openDetailAndCheckRefund(page) {
  // ----- Step 3: Navigate to booking detail -----
  await page.getByRole('link', { name: 'View My Bookings' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/bookings`);

  await page.getByRole('link', { name: 'View Details' }).first().click();
  await expect(page.getByText('Booking Information')).toBeVisible();

  // ----- Step 4: Validate booking ref -----
  const bookingRef = (await page.locator('.booking-ref').first().innerText()).trim();
  const eventTitle = (await page.locator('h1').first().innerText()).trim();
  // "first character of booking ref equals first character of event title"
  expect(bookingRef.charAt(0)).toBe(eventTitle.charAt(0));

  // ----- Step 5: Check refund eligibility -----
  await page.getByRole('button', { name: 'Check Refund Eligibility' }).click();

  const spinner = page.locator('#refund-spinner');
  await expect(spinner).toBeVisible(); // immediately visible
  await expect(spinner).toBeHidden({ timeout: 6000 }); // gone within 6s

  const result = page.locator('#refund-result');
  await expect(result).toBeVisible();
  return result;
}

test.describe('Refund eligibility', () => {
  test('Test 1 — single ticket booking is eligible for refund', async ({ page }) => {
    // Step 1: Login
    await loginAndGoToBooking(page);

    // Step 2: Book first event with 1 ticket (default)
    await bookFirstEvent(page, 0);

    // Steps 3–5
    const result = await openDetailAndCheckRefund(page);

    // Step 6: Validate result
    await expect(result).toContainText('Eligible for refund');
    await expect(result).toContainText('Single-ticket bookings qualify for a full refund');
  });

  test('Test 2 — group ticket booking is NOT eligible for refund', async ({ page }) => {
    // Step 1: Login
    await loginAndGoToBooking(page);

    // Step 2: Book first event, clicking "+" twice => 3 tickets
    await bookFirstEvent(page, 2);

    // Steps 3–5
    const result = await openDetailAndCheckRefund(page);

    // Step 6: Validate result (different assertions)
    await expect(result).toContainText('Not eligible for refund');
    await expect(result).toContainText('Group bookings (3 tickets) are non-refundable');
  });
});
