# BookingFlow — Playwright E2E

End-to-end Playwright tests for the **EventHub** demo app
(`https://eventhub.rahulshettyacademy.com`).

## What's covered

| Spec file | Scenario |
|-----------|----------|
| `tests/booking-flow.spec.js` | Logs in, creates a brand-new event from the admin panel, books it, verifies it appears in **My Bookings**, and asserts the seat count drops by **exactly 1**. |
| `tests/refund-eligibility.spec.js` | **Group booking (3 tickets):** books together, opens booking details, runs the refund-eligibility check (spinner appears then clears), and asserts *"Not eligible for refund"* with reason *"Group bookings (3 tickets) are non-refundable"*. Also covers a **1-ticket** booking that shows *"Eligible for refund"*. |

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

---

# Arcus Uploads — Phase 1 (headless)

A headless suite for the Arcus **Uploads** feature (see `arcus-tests/TEST_PLAN.md` for
the requirement-by-requirement traceability, 95 positive and negative tests).

```
arcus-tests/
  specs/            01 upload positive · 02 upload negative · 03 versions
                    04 search, panel, download · 05 delete · 06 API · 07 roles
  support/
    env.js          every URL, credential, limit and API path (env-driven)
    pages.js        page objects — ALL UI selectors live here
    api.js          Uploads API client + signed-URL helpers
    files.js        generates test files at runtime (PDF, PNG, CSV, EICAR, 500 MB+1 sparse …)
    test.js         fixtures: uploads, files, api, asRole
    global-setup.js / global-teardown.js   login per role · sweep files this run created
```

## Configure

| Variable | Required | Purpose |
|---|---|---|
| `ARCUS_USERNAME` / `ARCUS_PASSWORD` | yes | Main account (Admin/Developer). `USERNAME`/`PASSWORD` also work. |
| `ARCUS_BASE_URL` | no | Defaults to `BASE_URL`, then `https://arcus-edge.testsigma.com` |
| `ARCUS_UPLOADS_URL` | recommended | URL of one project's Uploads screen; otherwise the sidebar "Uploads" link is used |
| `ARCUS_API_TOKEN` | for API tests | Arcus API token; `ARCUS_API_BASE`, `ARCUS_API_UPLOADS_PATH`, `ARCUS_API_PROJECT_PARAM` set the contract |
| `ARCUS_TESTER_*`, `ARCUS_READONLY_*` | for role tests | `_USERNAME`/`_PASSWORD` of a Tester and a Read Only user; `ARCUS_READONLY_API_TOKEN` for FR6.2 |
| `ARCUS_UPLOAD_REQUEST_PATTERN` | if FR1.4 tests can't find the upload call | Regex for the request carrying file bytes (default `upload`) |
| `ARCUS_REFERENCED_FILE` | optional | An upload used by a test case step (delete-guard check, non-destructive) |
| `ARCUS_RUN_LARGE=1` / `ARCUS_RUN_BULK=1` | optional | Exactly-500 MB upload; 200-file search |
| `ARCUS_CHROMIUM_PATH` | optional | Chromium binary when the installed browser doesn't match the pinned Playwright |

## Run

```bash
npm run test:arcus                    # everything, headless
npm run test:arcus -- -g "UN-"        # negatives only
npm run test:arcus:list               # list the cases
npm run report:arcus
```

Every file the suite creates is named `pw-auto-<runId>-…` and deleted at the end of the run
(`ARCUS_SKIP_CLEANUP=1` keeps them). The GitHub Actions workflow **Arcus Uploads (headless)** runs it on demand.
