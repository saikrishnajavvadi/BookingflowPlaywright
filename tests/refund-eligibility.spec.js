// @ts-check
const { test, expect } = require('@playwright/test');
const { BASE_URL, CREDENTIALS, loginAndGoToBooking } = require('../utils/helpers');

/** Number of extra "+" clicks needed to reach a 3-ticket group booking. */
const GROUP_TICKET_EXTRA_CLICKS = 2;

/**
 * Books the first event on /events.
 * @param {import('@playwright/test').Page} page
 * @param {number} extraTickets number of times to click "+" (0 => 1 ticket)
 */
async function bookFirstEvent(page, extraTickets = 0) {
  await page.goto(`${BASE_URL}/events`);

  const firstCard = page.locator('[data-testid="event-card"]').first();
  await expect(firstCard).toBeVisible();
  await firstCard.getByTestId('book-now-btn').click();

  for (let i = 0; i < extraTickets; i++) {
    await page.locator('button:has-text("+")').click();
  }

  await expect(page.locator('#ticket-count')).toHaveText(String(extraTickets + 1));

  await page.getByLabel('Full Name').fill('QA Automation');
  await page.locator('#customer-email').fill(CREDENTIALS.email);
  await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
  await page.locator('.confirm-booking-btn').click();
}

/**
 * Opens the latest booking detail page from the confirmation screen.
 * @param {import('@playwright/test').Page} page
 */
async function openLatestBookingDetails(page) {
  await expect(page.getByText('Booking Confirmed')).toBeVisible();

  await page.getByRole('link', { name: 'View My Bookings' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/bookings`);

  await page.getByRole('link', { name: 'View Details' }).first().click();
  await expect(page.getByText('Booking Information')).toBeVisible();
}

test.describe('Group booking refund eligibility', () => {
  test('attendee sees that a 3-ticket group booking cannot be refunded', async ({ page }) => {
    await loginAndGoToBooking(page);

    await test.step('books a group of three tickets in a single booking', async () => {
      await bookFirstEvent(page, GROUP_TICKET_EXTRA_CLICKS);
      await expect(page.getByText('Booking Confirmed')).toBeVisible();
    });

    await test.step('opens booking details and requests a refund-eligibility check', async () => {
      await openLatestBookingDetails(page);
      await expect(page.getByText('Payment Summary').locator('..')).toContainText('3');
      await page.getByTestId('check-refund-btn').click();
    });

    const spinner = page.locator('#refund-spinner');

    await test.step('shows a loading indicator that clears within a few seconds', async () => {
      await expect(spinner).toBeVisible();
      await expect(spinner).toBeHidden({ timeout: 6000 });
    });

    await test.step('states the booking is not eligible and explains why', async () => {
      const result = page.locator('#refund-result');
      await expect(result).toBeVisible();
      await expect(result).toContainText('Not eligible for refund');
      await expect(result).toContainText('Group bookings (3 tickets) are non-refundable');
    });
  });
});

test.describe('Refund eligibility', () => {
  test('single-ticket booking is eligible for refund', async ({ page }) => {
    await loginAndGoToBooking(page);
    await bookFirstEvent(page, 0);

    await openLatestBookingDetails(page);
    await page.getByTestId('check-refund-btn').click();

    const spinner = page.locator('#refund-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).toBeHidden({ timeout: 6000 });

    const result = page.locator('#refund-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Eligible for refund');
    await expect(result).toContainText('Single-ticket bookings qualify for a full refund');
  });
});
