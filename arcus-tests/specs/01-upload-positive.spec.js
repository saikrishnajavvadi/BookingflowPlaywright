// @ts-check
/**
 * Positive upload paths — PRD FR1.1 (Upload a file) and Flow A.
 */
const { test, expect } = require('../support/test');
const { uniqueName, SIZE_TEXT } = require('../support/files');
const { RUN_LARGE, UPLOADER_DISPLAY_NAME, UPLOAD_REQUEST_PATTERN } = require('../support/env');

test.describe('Uploads › upload a file (FR1.1, Flow A)', () => {
  test('UP-01 browse upload stores the file and the row shows name, ID, version, size and uploader', async ({ uploads, files }) => {
    const name = uniqueName('invoice');
    await uploads.upload({ file: files.pdf('invoice.pdf'), name, version: 'v1' });

    const row = uploads.row(name);
    await expect(row).toContainText('v1');
    await expect(row).toContainText(SIZE_TEXT);
    if (UPLOADER_DISPLAY_NAME) await expect(row).toContainText(UPLOADER_DISPLAY_NAME);

    // ID is shown in the UI (Reference & API) — no DevTools lookup needed.
    const panel = await uploads.openPanel(name);
    expect(await panel.fileId()).toMatch(/\S{4,}/);
    await panel.expectLatest('v1');
  });

  test('UP-02 drag-and-drop upload stores the file', async ({ uploads, files }) => {
    const name = uniqueName('avatar');
    await uploads.upload({ file: files.png('avatar.png'), name, version: 'v1', via: 'drop' });
    await expect(uploads.row(name)).toContainText('v1');
  });

  test('UP-03 choosing a file shows its name and size and pre-fills Name', async ({ uploads, files }) => {
    const file = files.csv('fare_matrix.csv');
    const dialog = await uploads.openUploadDialog();
    await dialog.browseFile(file);

    await expect(dialog.text('fare_matrix.csv')).toBeVisible();
    await expect(dialog.root).toContainText(SIZE_TEXT);
    await expect(dialog.name).toHaveValue(/fare_matrix/);
    await dialog.cancel.click();
  });

  test('UP-04 a custom Name replaces the pre-filled one and is what the list shows', async ({ uploads, files }) => {
    const name = uniqueName('custom-name');
    await uploads.upload({ file: files.pdf('resume_sample.pdf'), name, version: 'v1' });
    await expect(uploads.row(name)).toBeVisible();
    await expect(uploads.page.getByRole('row').filter({ hasText: /^resume_sample\.pdf$/ })).toHaveCount(0);
  });

  // "Files of any type are listed together" (§4).
  const fileTypes = [
    ['PDF', (f) => f.pdf('invoice.pdf')],
    ['PNG', (f) => f.png('qr.png')],
    ['JPEG', (f) => f.jpg('photo.jpg')],
    ['CSV', (f) => f.csv('data.csv')],
    ['plain text', (f) => f.text('notes.txt')],
    ['ZIP archive', (f) => f.zip('bundle.zip')],
    ['no extension', (f) => f.text('README')],
    ['upper-case extension', (f) => f.pdf('SCAN.PDF')],
    ['spaces and brackets in file name', (f) => f.pdf('Monthly Report (final) #2.pdf')],
    ['unicode file name', (f) => f.pdf('résumé_测试_файл.pdf')],
    ['long file name (200 chars)', (f) => f.text(`${'a'.repeat(196)}.txt`)],
  ];
  for (const [label, make] of fileTypes) {
    test(`UP-05 accepts ${label}`, async ({ uploads, files }) => {
      const name = uniqueName(label.replace(/\W+/g, '-'));
      await uploads.upload({ file: make(files), name, version: 'v1' });
      await expect(uploads.row(name)).toContainText('v1');
    });
  }

  for (const version of ['v1', '2026-10-build', '1.0.0', 'release_candidate-2']) {
    test(`UP-06 accepts version label "${version}"`, async ({ uploads, files }) => {
      const name = uniqueName('label');
      await uploads.upload({ file: files.text(), name, version });
      await expect(uploads.row(name)).toContainText(version);
    });
  }

  test('UP-07 shows progress while uploading, then marks the new row Latest', async ({ uploads, files, page }) => {
    // Slow the byte-carrying request a little so the progress state is observable.
    await page.route(UPLOAD_REQUEST_PATTERN, async (route) => {
      if (['POST', 'PUT'].includes(route.request().method())) await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    const name = uniqueName('progress');
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name, version: 'v1' });
    await dialog.submit.click();
    await expect(dialog.progress).toBeVisible();
    await expect(dialog.root).toBeHidden({ timeout: 60_000 });
    await page.unroute(UPLOAD_REQUEST_PATTERN);

    const panel = await uploads.openPanel(name);
    await panel.expectLatest('v1');
  });

  test('UP-08 replacing the chosen file before Upload uploads the second file', async ({ uploads, files }) => {
    const name = uniqueName('replace-choice');
    const dialog = await uploads.openUploadDialog();
    await dialog.browseFile(files.pdf('first.pdf'));
    await dialog.browseFile(files.csv('second.csv'));
    await expect(dialog.text('second.csv')).toBeVisible();
    await expect(dialog.root.getByText('first.pdf')).toHaveCount(0);
    await dialog.fill({ name, version: 'v1' });
    await dialog.submitAndWaitClosed();
    await expect(uploads.row(name)).toBeVisible();
  });

  test('UP-09 Cancel closes the dialog and stores nothing', async ({ uploads, files }) => {
    const name = uniqueName('cancelled');
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name, version: 'v1' });
    await dialog.cancel.click();
    await expect(dialog.root).toBeHidden();
    await uploads.searchFor(name);
    await expect(uploads.row(name)).toHaveCount(0);
  });

  test('UP-10 a file of exactly the size limit is accepted (boundary)', async ({ uploads, files }) => {
    test.skip(!RUN_LARGE, 'Transfers ~500 MB — set ARCUS_RUN_LARGE=1 to run');
    test.setTimeout(30 * 60_000);
    const name = uniqueName('at-limit');
    await uploads.openUploadDialog();
    await uploads.dialog.fill({ file: files.atLimit(), name, version: 'v1' });
    await uploads.dialog.submit.click();
    await expect(uploads.dialog.root).toBeHidden({ timeout: 25 * 60_000 });
    await expect(uploads.row(name)).toContainText(/500(\.0+)?\s*MB|524\.?\d*\s*MB/i);
  });

  test('UP-11 the new file is the only one with its Name (no duplicate rows)', async ({ uploads, files }) => {
    const name = uniqueName('single-row');
    await uploads.upload({ file: files.pdf('x.pdf'), name, version: 'v1' });
    await uploads.searchFor(name);
    await expect(uploads.page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  });
});
