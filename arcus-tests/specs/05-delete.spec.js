// @ts-check
/**
 * Deleting a file — PRD FR1.7 and Flow G.
 */
const { test, expect } = require('../support/test');
const { uniqueName } = require('../support/files');
const { REFERENCED_FILE, API_TOKEN } = require('../support/env');

test.describe('Uploads › delete a file (FR1.7, Flow G)', () => {
  test('UX-01 Cancel on the delete confirmation keeps the file', async ({ uploads, files }) => {
    const name = uniqueName('keep');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const confirm = await uploads.startDelete(name);
    await confirm.dismiss();
    await expect(uploads.row(name)).toBeVisible();
  });

  test('UX-02 an unused file gets a short confirm and is removed with all its versions', async ({ uploads, files, api }) => {
    const name = uniqueName('delete-me');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v2' });
    const id = await panel.fileId();
    await panel.closePanel();

    const confirm = await uploads.startDelete(name);
    await expect(confirm.root).toBeVisible();
    // Short confirm: no list of referencing test cases for an unused file.
    await expect(confirm.root.getByText(/test case|steps? (use|using)/i)).toHaveCount(0);
    await confirm.accept();

    await expect(uploads.row(name)).toBeHidden();
    await uploads.searchFor(name);
    await expect(uploads.row(name)).toHaveCount(0);

    if (API_TOKEN) {
      const res = await api.get(id);
      expect(res.status()).toBe(404);
    }
  });

  test('UX-03 a deleted file Name can be used again for a new file', async ({ uploads, files }) => {
    const name = uniqueName('reuse-name');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    await uploads.deleteFile(name);
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    await expect(uploads.row(name)).toBeVisible();
  });

  test('UX-04 a file in use lists the referencing test cases and step counts before deleting', async ({ uploads }) => {
    test.skip(!REFERENCED_FILE, 'Set ARCUS_REFERENCED_FILE to an upload that a test case step uses');
    // Non-destructive: verifies the guard, then cancels.
    await uploads.searchFor(REFERENCED_FILE);
    const panel = await uploads.openPanel(REFERENCED_FILE);
    await panel.openTab('Used by');
    await expect(panel.rows().first()).toBeVisible();
    await panel.closePanel();

    const confirm = await uploads.startDelete(REFERENCED_FILE);
    await expect(confirm.root).toContainText(/test case/i);
    await expect(confirm.root).toContainText(/\d+\s*steps?/i);
    await confirm.dismiss();
    await expect(uploads.row(REFERENCED_FILE)).toBeVisible();
  });
});
