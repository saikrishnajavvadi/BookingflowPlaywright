// @ts-check
/**
 * Versions — PRD FR2.3 (new version), FR1.8 (delete a version) and the
 * version rules in §4 ("a label is unique within its file and never reused").
 */
const fs = require('fs');
const { test, expect } = require('../support/test');
const { uniqueName, SIZE_TEXT } = require('../support/files');

test.describe('Uploads › new version (FR2.3)', () => {
  test('UV-01 Upload new version locks Name, adds the version and marks it Latest', async ({ uploads, files }) => {
    const name = uniqueName('versioned');
    await uploads.upload({ file: files.pdf('invoice.pdf'), name, version: 'v1' });

    const panel = await uploads.uploadNewVersion(name, { file: files.pdf('invoice.pdf'), version: 'v2' });
    await panel.expectLatest('v2');
    await panel.expectNotLatest('v1');

    // Versions tab: label, uploader or run, date, size, Latest marker.
    const v2 = panel.versionRow('v2');
    await expect(v2).toContainText(SIZE_TEXT);
    await expect(v2).toContainText(/\d{1,2}[\s/:-]|ago|today/i);

    await panel.closePanel();
    await expect(uploads.row(name)).toContainText('v2'); // list shows the new Latest
  });

  test('UV-02 a new version may have a different file type and file name', async ({ uploads, files }) => {
    const name = uniqueName('type-change');
    await uploads.upload({ file: files.csv('export.csv'), name, version: 'v1' });
    const panel = await uploads.uploadNewVersion(name, { file: files.pdf('export.pdf'), version: 'v2' });
    await panel.expectLatest('v2');
  });

  test('UV-03 a version label already used for that file is blocked inline', async ({ uploads, files }) => {
    const name = uniqueName('dup-label');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });

    const panel = await uploads.openPanel(name);
    await panel.uploadNewVersion.click();
    await uploads.dialog.fill({ file: files.pdf(), version: 'v1' });
    await uploads.dialog.expectBlocked(/already (exists|used)|version.*(taken|exists|used)/i);
    await uploads.dialog.cancel.click();
    await panel.expectLatest('v1');
  });

  test('UV-04 the same version label is allowed on a different file', async ({ uploads, files }) => {
    const a = uniqueName('label-a');
    const b = uniqueName('label-b');
    await uploads.upload({ file: files.pdf(), name: a, version: 'v1' });
    await uploads.upload({ file: files.pdf(), name: b, version: 'v1' });
    await expect(uploads.row(b)).toContainText('v1');
  });

  test('UV-05 a new version without a file or label is blocked', async ({ uploads, files }) => {
    const name = uniqueName('nv-required');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.openPanel(name);

    await panel.uploadNewVersion.click();
    await uploads.dialog.fill({ version: 'v2' });
    await uploads.dialog.expectBlocked(); // no file
    await uploads.dialog.cancel.click();

    await panel.uploadNewVersion.click();
    await uploads.dialog.fill({ file: files.pdf() });
    await uploads.dialog.version.fill('');
    await uploads.dialog.expectBlocked(/required|enter a version/i); // no label
    await uploads.dialog.cancel.click();
    await panel.expectLatest('v1');
  });

  test('UV-06 the download link serves the Latest version bytes', async ({ uploads, files, request }) => {
    const name = uniqueName('latest-bytes');
    await uploads.upload({ file: files.text('a.txt'), name, version: 'v1' });
    const v2 = files.text('a.txt');
    const panel = await uploads.uploadNewVersion(name, { file: v2, version: 'v2' });

    const res = await request.get(await panel.downloadUrl());
    expect(res.status()).toBe(200);
    expect((await res.body()).equals(fs.readFileSync(v2))).toBe(true);
  });
});

test.describe('Uploads › delete a version (FR1.8)', () => {
  test('UV-07 deleting a non-Latest version removes it and keeps Latest', async ({ uploads, files }) => {
    const name = uniqueName('del-old');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v2' });

    const confirm = await panel.startDeleteVersion('v1');
    await confirm.accept();
    await expect(panel.versionRow('v1')).toHaveCount(0);
    await panel.expectLatest('v2');
  });

  test('UV-08 deleting Latest makes the previous version Latest', async ({ uploads, files }) => {
    const name = uniqueName('del-latest');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v2' });
    await uploads.panel.closePanel();
    const panel = await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v3' });

    const confirm = await panel.startDeleteVersion('v3');
    await confirm.accept();
    await panel.expectLatest('v2');
    await panel.closePanel();
    await expect(uploads.row(name)).toContainText('v2');
  });

  test('UV-09 the only version cannot be deleted', async ({ uploads, files, page }) => {
    const name = uniqueName('only-version');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.openPanel(name);
    await panel.openTab('Versions');
    const row = panel.versionRow('v1');

    const deleteControl = row
      .getByRole('button', { name: /delete/i })
      .or(page.getByRole('menuitem', { name: /delete/i }));
    const menu = row.getByRole('button', { name: /more|actions|options|menu/i });
    if (await menu.isVisible().catch(() => false)) await menu.click();

    // Either the option is absent/disabled, or using it is refused with a reason.
    if ((await deleteControl.count()) && (await deleteControl.first().isEnabled())) {
      await deleteControl.first().click();
      await expect(page.getByText(/only version|last version|cannot delete|at least one/i).first()).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await panel.expectLatest('v1');
  });

  test('UV-10 Cancel on delete-version keeps the version', async ({ uploads, files }) => {
    const name = uniqueName('del-cancel');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v2' });
    const confirm = await panel.startDeleteVersion('v1');
    await confirm.dismiss();
    await expect(panel.versionRow('v1')).toBeVisible();
  });

  test('UV-11 a deleted version label is never reused', async ({ uploads, files }) => {
    const name = uniqueName('no-reuse');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v2' });
    await (await panel.startDeleteVersion('v2')).accept();
    await panel.expectLatest('v1');

    await panel.uploadNewVersion.click();
    await uploads.dialog.fill({ file: files.pdf(), version: 'v2' });
    await uploads.dialog.expectBlocked(/already (exists|used)|used before|cannot be reused|version.*(taken|exists|used)/i);
    await uploads.dialog.cancel.click();
  });
});
