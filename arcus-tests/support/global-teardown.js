// @ts-check
/**
 * Deletes every upload this run created (names start with RUN_PREFIX).
 * The Uploads API has no delete operation (PRD FR6.1), so cleanup goes through the UI.
 */
const fs = require('fs');
const { chromium, expect } = require('@playwright/test');
const { RUN_PREFIX, SKIP_CLEANUP, authFile, CHROMIUM_PATH } = require('./env');
const { UploadsPage } = require('./pages');

module.exports = async function globalTeardown() {
  if (SKIP_CLEANUP || !fs.existsSync(authFile('admin'))) return;

  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_PATH });
  const context = await browser.newContext({ storageState: authFile('admin') });
  const uploads = new UploadsPage(await context.newPage());
  try {
    await uploads.goto();
    await uploads.searchFor(RUN_PREFIX);
    const leftovers = uploads.page.getByRole('row').filter({ hasText: RUN_PREFIX });
    for (let guard = 0; guard < 300 && (await leftovers.count()) > 0; guard++) {
      const name = (await leftovers.first().innerText()).match(new RegExp(`${RUN_PREFIX}[\\w-]*`))?.[0];
      if (!name) break;
      const confirm = await uploads.startDelete(name);
      await confirm.accept();
      await expect(uploads.row(name)).toBeHidden();
    }
  } catch (err) {
    console.warn(`[arcus teardown] cleanup incomplete — delete files starting with "${RUN_PREFIX}" manually.`, err);
  } finally {
    await browser.close();
  }
};
