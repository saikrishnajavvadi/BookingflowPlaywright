// @ts-check
const { test, expect } = require('@playwright/test');
const {
  BASE_URL,
  CREDENTIALS,
  futureDateValue,
  readSeatCount,
  login,
} = require('../utils/helpers');

test('create an event, book it, and verify the seat count drops by exactly 1', async ({ page }) => {
  // ----- Step 1: Login -----
  await login(page);

  // ----- Step 2: Create a new event -----
  await page.goto(`${BASE_URL}/admin/events`);

  // Unique title reused throughout the test.
  const eventTitle = `Test Event ${Date.now()}`;

  await page.locator('#event-title-input').fill(eventTitle);
  await page.locator('#admin-event-form textarea').fill('Automated end-to-end test event.');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('Venue').fill('Automation Arena');
  await page.getByLabel('Event Date & Time').fill(futureDateValue());
  await page.getByLabel('Price ($)').fill('100');
  await page.getByLabel('Total Seats').fill('50');
  await page.locator('#add-event-btn').click();

  // Toast confirms creation.
  await expect(page.getByText('Event created!')).toBeVisible();

  // ----- Step 3: Find the event card and capture seats -----
  await page.goto(`${BASE_URL}/events`);

  const cards = page.locator('[data-testid="event-card"]');
  await expect(cards.first()).toBeVisible();

  const matchedCard = cards.filter({ hasText: eventTitle });
  await expect(matchedCard).toBeVisible({ timeout: 5000 });

  const seatsBeforeBooking = await readSeatCount(matchedCard);
  console.log(`Seats before booking: ${seatsBeforeBooking}`);

  // ----- Step 4: Start booking -----
  await matchedCard.getByTestId('book-now-btn').click();

  // ----- Step 5: Fill the booking form -----
  await expect(page.locator('#ticket-count')).toHaveText('1');
  await page.getByLabel('Full Name').fill('QA Automation');
  await page.locator('#customer-email').fill(CREDENTIALS.email);
  await page.getByPlaceholder('+91 98765 43210').fill('9876543210');
  await page.locator('.confirm-booking-btn').click();

  // ----- Step 6: Verify booking confirmation -----
  const bookingRefEl = page.locator('.booking-ref').first();
  await expect(bookingRefEl).toBeVisible();
  const bookingRef = (await bookingRefEl.innerText()).trim();
  console.log(`Booking reference: ${bookingRef}`);

  // ----- Step 7: Verify in My Bookings -----
  await page.getByRole('link', { name: 'View My Bookings' }).click();
  await expect(page).toHaveURL(`${BASE_URL}/bookings`);

  const bookingCards = page.locator('#booking-card');
  await expect(bookingCards.first()).toBeVisible();

  const matchedBooking = bookingCards.filter({
    has: page.locator('.booking-ref', { hasText: bookingRef }),
  });
  await expect(matchedBooking).toBeVisible();
  await expect(matchedBooking).toContainText(eventTitle);

  // ----- Step 8: Verify seat reduction -----
  await page.goto(`${BASE_URL}/events`);
  await expect(cards.first()).toBeVisible();

  const matchedCardAfter = cards.filter({ hasText: eventTitle });
  await expect(matchedCardAfter).toBeVisible();

  const seatsAfterBooking = await readSeatCount(matchedCardAfter);
  console.log(`Seats after booking: ${seatsAfterBooking}`);

  expect(seatsAfterBooking).toBe(seatsBeforeBooking - 1);
});
