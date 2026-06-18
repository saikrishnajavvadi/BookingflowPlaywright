# BookingFlow — Playwright E2E

End-to-end Playwright tests for the **EventHub** demo app
(`https://eventhub.rahulshettyacademy.com`).

## What's covered

| Spec file | Scenario |
|-----------|----------|
| `tests/booking-flow.spec.js` | Logs in, creates a brand-new event from the admin panel, books it, verifies it appears in **My Bookings**, and asserts the seat count drops by **exactly 1**. |
| `tests/refund-eligibility.spec.js` | Two tests: a **1-ticket** booking shows *"Eligible for refund"*, a **3-ticket** booking shows *"Not eligible for refund"*. Both verify the `#refund-spinner` appears and then disappears before the result is shown. |

Reusable helpers live in `utils/helpers.js`:
`login(page)`, `loginAndGoToBooking(page)`, `futureDateValue()`, `readSeatCount(card)`.

## Setup

```bash
npm install
npx playwright install --with-deps
```

## Credentials

The tests need a valid EventHub account. Provide it via environment variables
(recommended) or edit the fallback values in `utils/helpers.js`:

```bash
export EVENTHUB_EMAIL="you@example.com"
export EVENTHUB_PASSWORD="your-password"
```

In CI, set these as the repository secrets `EVENTHUB_EMAIL` and
`EVENTHUB_PASSWORD` (the included GitHub Actions workflow reads them).

## Run

```bash
npm test                 # all tests
npm run test:booking     # booking + seat-reduction flow only
npm run test:refund      # refund eligibility tests only
npm run test:headed      # watch it run in a browser
npm run report           # open the HTML report
```

## Notes

- Selectors follow the exact locators specified for each step (placeholder,
  label, id, `data-testid`, and CSS-class strategies).
- `fullyParallel` is off and `workers: 1` so the booking flow's seat-count
  assertion isn't disturbed by other tests creating bookings concurrently.
