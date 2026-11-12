// @ts-check
/**
 * Negative upload paths — PRD FR1.2 (size limit), FR1.3 (name clash),
 * FR1.4 (upload failure), FR1.9 (malware scan) and required-field validation.
 */
const { test, expect } = require('../support/test');
const { uniqueName, mbPattern } = require('../support/files');
const { SIZE_LIMIT_BYTES, UPLOAD_REQUEST_PATTERN } = require('../support/env');

test.describe('Uploads › required fields (FR1.1)', () => {
  test('UN-01 Upload is blocked without a file', async ({ uploads }) => {
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ name: uniqueName('no-file'), version: 'v1' });
    await dialog.expectBlocked();
  });

  test('UN-02 Upload is blocked without a Name', async ({ uploads, files }) => {
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), version: 'v1' });
    await dialog.name.fill('');
    await dialog.expectBlocked(/name.*required|required|enter a name/i);
  });

  test('UN-03 Upload is blocked with a whitespace-only Name', async ({ uploads, files }) => {
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name: '   ', version: 'v1' });
    await dialog.expectBlocked(/name.*required|required|invalid|enter a name/i);
  });

  test('UN-04 Upload is blocked without a Version', async ({ uploads, files }) => {
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name: uniqueName('no-version') });
    await dialog.version.fill('');
    await dialog.expectBlocked(/version.*required|required|enter a version/i);
  });

  test('UN-05 Upload is blocked with a whitespace-only Version', async ({ uploads, files }) => {
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name: uniqueName('blank-version'), version: '   ' });
    await dialog.expectBlocked(/version.*required|required|invalid|enter a version/i);
  });
});

test.describe('Uploads › size limit (FR1.2)', () => {
  test('UN-06 a file one byte over the limit is rejected inline with the limit and the file size', async ({ uploads, files }) => {
    const file = files.overLimit();
    const dialog = await uploads.openUploadDialog();
    await dialog.browseFile(file);

    // "a message stating the limit and the file's size"
    await expect(dialog.root).toContainText(mbPattern(SIZE_LIMIT_BYTES));
    await expect(dialog.root).toContainText(/limit|too large|exceeds|maximum/i);
    await expect(dialog.submit).toBeDisabled();
  });

  test('UN-07 an over-limit file stores nothing', async ({ uploads, files }) => {
    const name = uniqueName('over-limit');
    const dialog = await uploads.openUploadDialog();
    await dialog.browseFile(files.overLimit());
    if (await dialog.name.isEditable()) await dialog.name.fill(name);
    await dialog.version.fill('v1');
    await dialog.expectBlocked(/limit|too large|exceeds/i);
    await dialog.cancel.click();
    await uploads.searchFor(name);
    await expect(uploads.row(name)).toHaveCount(0);
  });

  test('UN-08 picking a valid file after an over-limit one clears the error', async ({ uploads, files }) => {
    const dialog = await uploads.openUploadDialog();
    await dialog.browseFile(files.overLimit());
    await expect(dialog.root).toContainText(/limit|too large|exceeds/i);
    await dialog.browseFile(files.pdf());
    await expect(dialog.root.getByText(/too large|exceeds/i)).toHaveCount(0);
    await dialog.fill({ name: uniqueName('after-over-limit'), version: 'v1' });
    await expect(dialog.submit).toBeEnabled();
    await dialog.cancel.click();
  });
});

test.describe('Uploads › name clash (FR1.3)', () => {
  test('UN-09 a Name already used in the project is blocked and "Upload as new version" is offered', async ({ uploads, files }) => {
    const name = uniqueName('clash');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });

    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name, version: 'v2' });
    await dialog.expectBlocked(/already (exists|used|in use)|name.*taken/i);
    await expect(dialog.uploadAsNewVersion).toBeVisible();
    await dialog.cancel.click();

    // Still exactly one file with that name.
    await uploads.searchFor(name);
    await expect(uploads.page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  });

  test('UN-10 "Upload as new version" from a clash adds a version to the existing file', async ({ uploads, files }) => {
    const name = uniqueName('clash-to-version');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });

    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name, version: 'v2' });
    await dialog.expectBlocked(/already (exists|used|in use)|name.*taken/i);
    await dialog.uploadAsNewVersion.click();

    await expect(dialog.name).not.toBeEditable(); // new-version mode locks Name
    await expect(dialog.name).toHaveValue(name);
    if (!(await dialog.version.inputValue())) await dialog.version.fill('v2');
    await dialog.submitAndWaitClosed();

    await expect(uploads.row(name)).toContainText('v2');
    const panel = await uploads.openPanel(name);
    await panel.expectLatest('v2');
    await expect(panel.versionRow('v1')).toBeVisible();
  });
});

test.describe('Uploads › upload failure (FR1.4)', () => {
  /** Aborts the first byte-carrying request, then lets later ones through. */
  async function dropFirstUpload(page) {
    let dropped = false;
    await page.route(UPLOAD_REQUEST_PATTERN, async (route) => {
      if (!dropped && ['POST', 'PUT', 'PATCH'].includes(route.request().method())) {
        dropped = true;
        return route.abort('connectionreset');
      }
      return route.continue();
    });
    return () => dropped;
  }

  test('UN-11 a dropped connection offers Retry and stores nothing partial', async ({ uploads, files, page }) => {
    const wasDropped = await dropFirstUpload(page);
    const name = uniqueName('dropped');
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name, version: 'v1' });
    await dialog.submit.click();

    await expect(dialog.retry).toBeVisible();
    expect(wasDropped(), `no request matched ${UPLOAD_REQUEST_PATTERN} — set ARCUS_UPLOAD_REQUEST_PATTERN`).toBe(true);
    await expect(page.getByText(/fail|error|connection|network/i).first()).toBeVisible();

    await dialog.cancel.click().catch(() => page.keyboard.press('Escape'));
    await page.unroute(UPLOAD_REQUEST_PATTERN);
    await uploads.goto();
    await uploads.searchFor(name);
    await expect(uploads.row(name)).toHaveCount(0);
  });

  test('UN-12 Retry after a dropped connection succeeds and creates exactly one file', async ({ uploads, files, page }) => {
    await dropFirstUpload(page);
    const name = uniqueName('retried');
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name, version: 'v1' });
    await dialog.submit.click();
    await dialog.retry.click();
    await expect(dialog.root).toBeHidden({ timeout: 60_000 });

    await uploads.searchFor(name);
    await expect(uploads.page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
    const panel = await uploads.openPanel(name);
    await panel.openTab('Versions');
    await expect(panel.rows().filter({ hasText: /\bv1\b/ })).toHaveCount(1);
  });

  test('UN-13 going offline mid-upload fails cleanly and stores nothing', async ({ uploads, files, page, context }) => {
    const name = uniqueName('offline');
    await page.route(UPLOAD_REQUEST_PATTERN, async (route) => {
      if (['POST', 'PUT', 'PATCH'].includes(route.request().method())) {
        await context.setOffline(true);
        return route.abort('internetdisconnected');
      }
      return route.continue();
    });
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.pdf(), name, version: 'v1' });
    await dialog.submit.click();
    await expect(dialog.retry.or(page.getByText(/offline|network|connection|failed/i)).first()).toBeVisible();

    await context.setOffline(false);
    await page.unroute(UPLOAD_REQUEST_PATTERN);
    await uploads.goto();
    await uploads.searchFor(name);
    await expect(uploads.row(name)).toHaveCount(0);
  });
});

test.describe('Uploads › malware scan (FR1.9)', () => {
  test('UN-14 an infected file (EICAR test signature) is rejected with a message and nothing is stored', async ({ uploads, files, page }) => {
    const name = uniqueName('eicar');
    const dialog = await uploads.openUploadDialog();
    await dialog.fill({ file: files.eicar(), name, version: 'v1' });
    await dialog.submit.click();

    await expect(page.getByText(/malware|virus|infected|threat|unsafe/i).first()).toBeVisible({ timeout: 60_000 });
    await dialog.cancel.click().catch(() => page.keyboard.press('Escape'));
    await uploads.goto();
    await uploads.searchFor(name);
    await expect(uploads.row(name)).toHaveCount(0);
  });

  test('UN-15 an infected file is also rejected as a new version and Latest is unchanged', async ({ uploads, files, page }) => {
    const name = uniqueName('eicar-version');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });

    const panel = await uploads.openPanel(name);
    await panel.uploadNewVersion.click();
    await uploads.dialog.fill({ file: files.eicar(), version: 'v2' });
    await uploads.dialog.submit.click();
    await expect(page.getByText(/malware|virus|infected|threat|unsafe/i).first()).toBeVisible({ timeout: 60_000 });
    await uploads.dialog.cancel.click().catch(() => page.keyboard.press('Escape'));

    await uploads.goto();
    const reopened = await uploads.openPanel(name);
    await reopened.expectLatest('v1');
    await expect(reopened.versionRow('v2')).toHaveCount(0);
  });
});
