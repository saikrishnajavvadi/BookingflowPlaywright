// @ts-check
/**
 * Logs in once per configured role and saves the session to arcus-tests/.auth/<role>.json.
 */
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { ROLES, AUTH_DIR, authFile, BASE_URL, CHROMIUM_PATH } = require('./env');
const { login } = require('./pages');

module.exports = async function globalSetup() {
  if (!ROLES.admin) {
    throw new Error(
      'Arcus credentials missing: set ARCUS_USERNAME and ARCUS_PASSWORD (USERNAME / PASSWORD are also accepted).',
    );
  }
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
  try {
    for (const user of Object.values(ROLES)) {
      if (!user) continue;
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();
      await login(page, user);
      await context.storageState({ path: authFile(/** @type {any} */ (user.role)) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
};
