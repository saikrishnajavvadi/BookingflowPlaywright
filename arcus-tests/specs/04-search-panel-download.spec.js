// @ts-check
/**
 * Search (FR1.5), file panel (FR1.6), download links from the panel (FR6.3)
 * and the Activity log (FR7.4).
 */
const fs = require('fs');
const { test, expect, requireApiToken } = require('../support/test');
const { uniqueName } = require('../support/files');
const { signedUrlTtlSeconds, tamperSignature, idOf } = require('../support/api');
const { RUN_BULK, RUN_PREFIX } = require('../support/env');

test.describe('Uploads › search (FR1.5)', () => {
  test('US-01 search by name matches full, partial and different-case text across file types', async ({ uploads, files }) => {
    const token = uniqueName('srch');
    const pdf = `${token}-invoice`;
    const png = `${token}-scan`;
    const csv = `${token}-fares`;
    const other = uniqueName('unrelated');
    await uploads.upload({ file: files.pdf(), name: pdf, version: 'v1' });
    await uploads.upload({ file: files.png(), name: png, version: 'v1' });
    await uploads.upload({ file: files.csv(), name: csv, version: 'v1' });
    await uploads.upload({ file: files.text(), name: other, version: 'v1' });

    await uploads.searchFor(token);
    for (const n of [pdf, png, csv]) await expect(uploads.row(n)).toBeVisible();
    await expect(uploads.row(other)).toHaveCount(0);

    await uploads.searchFor(pdf); // full name
    await expect(uploads.row(pdf)).toBeVisible();
    await expect(uploads.row(png)).toHaveCount(0);

    await uploads.searchFor(`${token}-SCA`.toUpperCase()); // partial, upper-case
    await expect(uploads.row(png)).toBeVisible();
  });

  test('US-02 a search with no match shows an empty state', async ({ uploads }) => {
    await uploads.searchFor(`${RUN_PREFIX}-does-not-exist-zz9`);
    await expect(uploads.emptyState).toBeVisible();
    await expect(uploads.page.getByRole('row').filter({ hasText: RUN_PREFIX })).toHaveCount(0);
  });

  test('US-03 clearing the search restores the full list', async ({ uploads, files }) => {
    const name = uniqueName('clear-search');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    await uploads.searchFor('zz-no-match-zz');
    await expect(uploads.row(name)).toHaveCount(0);
    await uploads.clearSearch();
    await expect(uploads.row(name)).toBeVisible();
  });

  for (const q of ['%', '_', "' OR 1=1 --", '<script>alert(1)</script>', '../../etc/passwd', '😀']) {
    test(`US-04 special-character search "${q}" is handled safely`, async ({ uploads, page }) => {
      let dialogFired = false;
      page.on('dialog', async (d) => {
        dialogFired = true;
        await d.dismiss();
      });
      await uploads.searchFor(q);
      await expect(uploads.heading).toBeVisible();
      await expect(page.getByText(/something went wrong|internal server error|exception/i)).toHaveCount(0);
      expect(dialogFired, 'search input must not execute script').toBe(false);
    });
  }

  test('US-05 search finds a file in a project with 200+ files', async ({ uploads, files, api }) => {
    test.skip(!RUN_BULK, 'Seeds 200 files via the API — set ARCUS_RUN_BULK=1 to run');
    requireApiToken();
    test.setTimeout(20 * 60_000);
    const token = uniqueName('bulk');
    const file = files.text();
    for (let i = 0; i < 200; i++) await api.createOk({ name: `${token}-${String(i).padStart(3, '0')}`, version: 'v1', file });

    await uploads.goto();
    await uploads.searchFor(`${token}-137`);
    await expect(uploads.row(`${token}-137`)).toBeVisible();
    await expect(uploads.page.getByRole('row').filter({ hasText: token })).toHaveCount(1);
  });
});

test.describe('Uploads › file panel (FR1.6)', () => {
  test('UF-01 the panel has Versions, Used by, Activity and Reference & API tabs, each opens', async ({ uploads, files }) => {
    const name = uniqueName('panel');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.openPanel(name);
    for (const tab of /** @type {const} */ (['Versions', 'Used by', 'Activity', 'Reference & API'])) {
      await panel.openTab(tab);
    }
  });

  test('UF-02 Used by is empty for a file no step uses', async ({ uploads, files }) => {
    const name = uniqueName('unused');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.openPanel(name);
    await panel.openTab('Used by');
    await expect(panel.root.getByText(/not used|no (test cases|steps)|unused|0 steps/i).first()).toBeVisible();
  });

  test('UF-03 Reference & API shows the ID and Copy puts a reference containing it on the clipboard', async ({ uploads, files, page }) => {
    const name = uniqueName('reference');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.openPanel(name);
    const id = await panel.fileId();
    expect(id).toMatch(/\S{4,}/);

    await panel.copyReference.click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain(id);
  });

  test('UF-04 the file ID in the UI matches the API', async ({ uploads, files, api }) => {
    requireApiToken();
    const name = uniqueName('id-parity');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.openPanel(name);
    const id = await panel.fileId();
    const res = await api.get(id);
    expect(res.status()).toBe(200);
    expect(idOf(await res.json())).toBe(id);
  });
});

test.describe('Uploads › download link from the panel (FR6.3)', () => {
  test('UD-01 Get download link returns a signed URL that downloads the exact bytes', async ({ uploads, files, request }) => {
    const name = uniqueName('download');
    const file = files.pdf();
    await uploads.upload({ file, name, version: 'v1' });
    const panel = await uploads.openPanel(name);
    const url = await panel.downloadUrl();

    const res = await request.get(url);
    expect(res.status()).toBe(200);
    expect((await res.body()).equals(fs.readFileSync(file))).toBe(true);
  });

  test('UD-02 the signed link expires after 3 hours', async ({ uploads, files }) => {
    const name = uniqueName('ttl');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const url = await (await uploads.openPanel(name)).downloadUrl();
    const ttl = signedUrlTtlSeconds(url);
    expect(ttl, `could not read an expiry from the signed URL: ${url.split('?')[0]}?…`).toBeDefined();
    expect(ttl).toBeGreaterThan(3 * 3600 - 300);
    expect(ttl).toBeLessThanOrEqual(3 * 3600 + 60);
  });

  test('UD-03 a tampered signed link is refused', async ({ uploads, files, request }) => {
    const name = uniqueName('tamper');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const url = await (await uploads.openPanel(name)).downloadUrl();
    const bad = tamperSignature(url);
    test.skip(!bad, 'Signed URL has no recognisable signature parameter');
    const res = await request.get(/** @type {string} */ (bad));
    expect([400, 401, 403]).toContain(res.status());
  });

  test('UD-04 the link without its signature is refused', async ({ uploads, files, request }) => {
    const name = uniqueName('unsigned');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const url = await (await uploads.openPanel(name)).downloadUrl();
    const res = await request.get(url.split('?')[0]);
    expect([400, 401, 403, 404]).toContain(res.status());
  });
});

test.describe('Uploads › activity / audit (FR7.4)', () => {
  test('UA-01 Activity lists the upload, the new version and the download', async ({ uploads, files }) => {
    const name = uniqueName('activity');
    await uploads.upload({ file: files.pdf(), name, version: 'v1' });
    const panel = await uploads.uploadNewVersion(name, { file: files.pdf(), version: 'v2' });
    await panel.downloadUrl();

    await panel.openTab('Activity');
    await expect(panel.root.getByText(/upload/i).first()).toBeVisible();
    await expect(panel.root.getByText(/v2|new version/i).first()).toBeVisible();
    await expect(panel.root.getByText(/download/i).first()).toBeVisible();
  });
});
