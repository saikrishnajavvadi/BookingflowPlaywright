// @ts-check
/**
 * Extended Playwright `test` for the Uploads suite:
 *  - `files`   — FileFactory writing into the test's own output folder
 *  - `uploads` — UploadsPage already opened on the project's Uploads screen
 *  - `api`     — UploadsApi using ARCUS_API_TOKEN
 *  - `asRole`  — opens a new page logged in as tester / readonly (skips if not configured)
 */
const base = require('@playwright/test');
const fs = require('fs');
const { FileFactory } = require('./files');
const { UploadsPage } = require('./pages');
const { UploadsApi } = require('./api');
const { API_TOKEN, ROLES, authFile } = require('./env');

const test = base.test.extend({
  files: async ({}, use, testInfo) => {
    await use(new FileFactory(testInfo.outputPath('files')));
  },

  uploads: async ({ page }, use) => {
    const uploads = new UploadsPage(page);
    await uploads.goto();
    await use(uploads);
  },

  api: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ ignoreHTTPSErrors: false });
    await use(new UploadsApi(request, API_TOKEN));
    await request.dispose();
  },

  asRole: async ({ browser }, use) => {
    const contexts = [];
    /** @param {'tester' | 'readonly'} role */
    const open = async (role) => {
      const state = authFile(role);
      test.skip(!ROLES[role] || !fs.existsSync(state), `Set ARCUS_${role.toUpperCase()}_USERNAME/PASSWORD to run ${role} checks`);
      const context = await browser.newContext({ storageState: state });
      contexts.push(context);
      const uploads = new UploadsPage(await context.newPage());
      await uploads.goto();
      return uploads;
    };
    await use(open);
    for (const c of contexts) await c.close();
  },
});

const requireApiToken = () => test.skip(!API_TOKEN, 'Set ARCUS_API_TOKEN to run Uploads API checks');

module.exports = { test, expect: base.expect, requireApiToken };
