// @ts-check
/**
 * Role permissions on Uploads — PRD FR7.3 default matrix and Flow B
 * ("A read-only role sees the panel and can download, with upload and delete hidden").
 *
 *   Action                     Admin  PM   Developer  Tester  Read Only
 *   View and download           Yes   Yes     Yes       Yes      Yes
 *   Upload and add versions     Yes   Yes     Yes       Yes      No
 *   Delete a file or version    Yes   Yes     Yes       No       No
 */
const { test, expect } = require('../support/test');
const { uniqueName } = require('../support/files');
const { ROLES } = require('../support/env');

test.describe('Uploads › roles (FR7.3)', () => {
  test.skip(!ROLES.readonly && !ROLES.tester, 'Set ARCUS_READONLY_* and/or ARCUS_TESTER_* credentials to run role checks');

  /** @type {string} */
  let name;

  test.beforeEach(async ({ uploads, files }) => {
    name = uniqueName('roles');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v2' });
  });

  test('UR-01 Read Only sees the list and panel and can download', async ({ asRole, request }) => {
    const ro = await asRole('readonly');
    await ro.searchFor(name);
    const panel = await ro.openPanel(name);
    for (const tab of /** @type {const} */ (['Versions', 'Used by', 'Activity', 'Reference & API'])) await panel.openTab(tab);
    const res = await request.get(await panel.downloadUrl());
    expect(res.status()).toBe(200);
  });

  test('UR-02 Read Only has no Upload, Upload new version or Delete controls', async ({ asRole }) => {
    const ro = await asRole('readonly');
    await expect(ro.uploadButton).toBeHidden();
    await ro.searchFor(name);
    const panel = await ro.openPanel(name);
    await expect(panel.uploadNewVersion).toBeHidden();
    await expect(panel.deleteFile).toBeHidden();
    await panel.openTab('Versions');
    await expect(panel.versionRow('v1').getByRole('button', { name: /delete/i })).toHaveCount(0);
  });

  test('UR-03 Tester can upload a file and add a version', async ({ asRole, files }) => {
    const tester = await asRole('tester');
    const own = uniqueName('tester-upload');
    await tester.upload({ file: files.pdf(), name: own, version: 'v1' });
    const panel = await tester.uploadNewVersion(own, { file: files.pdf(), version: 'v2' });
    await panel.expectLatest('v2');
  });

  test('UR-04 Tester cannot delete a file or a version', async ({ asRole }) => {
    const tester = await asRole('tester');
    await tester.searchFor(name);
    const panel = await tester.openPanel(name);
    await expect(panel.deleteFile).toBeHidden();
    await panel.openTab('Versions');
    const row = panel.versionRow('v1');
    await expect(row.getByRole('button', { name: /delete/i })).toHaveCount(0);
    const menu = row.getByRole('button', { name: /more|actions|options|menu/i });
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
      await expect(tester.page.getByRole('menuitem', { name: /delete/i })).toHaveCount(0);
    }
  });
});
