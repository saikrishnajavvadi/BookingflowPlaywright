// @ts-check
/**
 * Headless Playwright config for the Arcus Uploads (Phase 1) suite.
 * Run with: npm run test:arcus
 */
const { defineConfig, devices } = require('@playwright/test');
const { BASE_URL, authFile, CHROMIUM_PATH } = require('./arcus-tests/support/env');

module.exports = defineConfig({
  testDir: './arcus-tests/specs',
  globalSetup: require.resolve('./arcus-tests/support/global-setup'),
  globalTeardown: require.resolve('./arcus-tests/support/global-teardown'),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One project's Uploads library is shared state (search results, name clashes),
  // so tests run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results/arcus',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/arcus' }],
    ['junit', { outputFile: 'test-results/arcus/junit.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    storageState: authFile('admin'),
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
    launchOptions: { executablePath: CHROMIUM_PATH },
  },
  projects: [{ name: 'arcus-chromium', use: { ...devices['Desktop Chrome'] } }],
});
