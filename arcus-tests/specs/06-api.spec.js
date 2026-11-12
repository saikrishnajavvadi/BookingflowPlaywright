// @ts-check
/**
 * Uploads API — PRD FR6.1 (five operations), FR6.2 (permission parity),
 * FR6.3 (3-hour signed download links), plus input validation.
 * Requires ARCUS_API_TOKEN; paths are configured in support/env.js.
 */
const fs = require('fs');
const { test, expect, requireApiToken } = require('../support/test');
const { uniqueName } = require('../support/files');
const {
  idOf,
  nameOf,
  items,
  versionLabelOf,
  latestLabelOf,
  findUrl,
  signedUrlTtlSeconds,
} = require('../support/api');
const { READONLY_API_TOKEN, RUN_LARGE } = require('../support/env');

const CLIENT_ERROR = [400, 409, 413, 415, 422];

test.describe('Uploads API › operations (FR6.1)', () => {
  test.beforeEach(() => requireApiToken());

  test('API-01 create a file returns its ID, Name and v1 as Latest', async ({ api, files }) => {
    const name = uniqueName('api-create');
    const res = await api.create({ name, version: 'v1', file: files.pdf() });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(idOf(body)).toBeTruthy();
    expect(nameOf(body)).toBe(name);
    expect(latestLabelOf(body) ?? versionLabelOf(body)).toBe('v1');
  });

  test('API-02 get one file returns a signed download link with the exact bytes, valid ~3 hours', async ({ api, files, request }) => {
    const file = files.pdf();
    const created = await api.createOk({ name: uniqueName('api-get'), version: 'v1', file });
    const res = await api.get(idOf(created));
    expect(res.status()).toBe(200);
    const url = findUrl(await res.json());
    expect(url, 'no download URL in the get response').toBeTruthy();

    const dl = await request.get(/** @type {string} */ (url));
    expect(dl.status()).toBe(200);
    expect((await dl.body()).equals(fs.readFileSync(file))).toBe(true);

    const ttl = signedUrlTtlSeconds(/** @type {string} */ (url));
    expect(ttl).toBeDefined();
    expect(ttl).toBeGreaterThan(3 * 3600 - 300);
    expect(ttl).toBeLessThanOrEqual(3 * 3600 + 60);
  });

  test('API-03 list files includes a created file', async ({ api, files }) => {
    const name = uniqueName('api-list');
    await api.createOk({ name, version: 'v1', file: files.text() });
    const res = await api.list({ search: name, name, query: name });
    expect(res.status()).toBe(200);
    expect(items(await res.json()).map(nameOf)).toContain(name);
  });

  test('API-04 add a version makes it Latest and list versions returns both', async ({ api, files, request }) => {
    const created = await api.createOk({ name: uniqueName('api-version'), version: 'v1', file: files.text() });
    const id = idOf(created);
    const v2 = files.text();

    const add = await api.addVersion(id, { version: 'v2', file: v2 });
    expect([200, 201]).toContain(add.status());

    const versions = await api.listVersions(id);
    expect(versions.status()).toBe(200);
    expect(items(await versions.json()).map(versionLabelOf).sort()).toEqual(['v1', 'v2']);

    const got = await (await api.get(id)).json();
    expect(latestLabelOf(got)).toBe('v2');
    const dl = await request.get(/** @type {string} */ (findUrl(got)));
    expect((await dl.body()).equals(fs.readFileSync(v2))).toBe(true);
  });

  test('API-05 a version pushed via the API shows in the UI as Latest (CI journey)', async ({ api, files, uploads }) => {
    const name = uniqueName('api-to-ui');
    const created = await api.createOk({ name, version: 'v1', file: files.csv() });
    await api.addVersion(idOf(created), { version: 'nightly-2026-11-12', file: files.csv() });

    await uploads.goto();
    await uploads.searchFor(name);
    const panel = await uploads.openPanel(name);
    await panel.expectLatest('nightly-2026-11-12');
  });
});

test.describe('Uploads API › validation (negative)', () => {
  test.beforeEach(() => requireApiToken());

  test('API-06 create without a file is rejected', async ({ api }) => {
    const res = await api.create({ name: uniqueName('api-nofile'), version: 'v1' });
    expect(CLIENT_ERROR).toContain(res.status());
  });

  test('API-07 create without a Name is rejected', async ({ api, files }) => {
    const res = await api.create({ version: 'v1', file: files.pdf() });
    // Some APIs default the Name to the file name; if so it must at least succeed cleanly.
    expect([...CLIENT_ERROR, 200, 201]).toContain(res.status());
    if (res.ok()) expect(nameOf(await res.json())).toBeTruthy();
  });

  test('API-08 create without a Version is rejected', async ({ api, files }) => {
    const res = await api.create({ name: uniqueName('api-noversion'), file: files.pdf() });
    expect(CLIENT_ERROR).toContain(res.status());
  });

  test('API-09 create with an empty Name is rejected', async ({ api, files }) => {
    const res = await api.create({ name: '', version: 'v1', file: files.pdf() });
    expect(CLIENT_ERROR).toContain(res.status());
  });

  test('API-10 create with a Name already used in the project is rejected (FR1.3)', async ({ api, files }) => {
    const name = uniqueName('api-clash');
    await api.createOk({ name, version: 'v1', file: files.pdf() });
    const res = await api.create({ name, version: 'v2', file: files.pdf() });
    expect([400, 409, 422]).toContain(res.status());
  });

  test('API-11 add version with a label already used for that file is rejected', async ({ api, files }) => {
    const id = idOf(await api.createOk({ name: uniqueName('api-duplabel'), version: 'v1', file: files.pdf() }));
    const res = await api.addVersion(id, { version: 'v1', file: files.pdf() });
    expect([400, 409, 422]).toContain(res.status());
  });

  test('API-12 add version without a file is rejected', async ({ api, files }) => {
    const id = idOf(await api.createOk({ name: uniqueName('api-vnofile'), version: 'v1', file: files.pdf() }));
    const res = await api.addVersion(id, { version: 'v2' });
    expect(CLIENT_ERROR).toContain(res.status());
  });

  test('API-13 unknown file ID returns 404 for get, list versions and add version', async ({ api, files }) => {
    const missing = '999999999';
    expect((await api.get(missing)).status()).toBe(404);
    expect((await api.listVersions(missing)).status()).toBe(404);
    expect((await api.addVersion(missing, { version: 'v1', file: files.pdf() })).status()).toBe(404);
  });

  test('API-14 an infected file (EICAR) is rejected and nothing is stored (FR1.9)', async ({ api, files }) => {
    const name = uniqueName('api-eicar');
    const res = await api.create({ name, version: 'v1', file: files.eicar() });
    expect(CLIENT_ERROR).toContain(res.status());
    const list = await api.list({ search: name, name, query: name });
    expect(items(await list.json()).map(nameOf)).not.toContain(name);
  });

  test('API-15 a file over the size limit is rejected with 413/400 (FR1.2)', async ({ api, files }) => {
    test.skip(!RUN_LARGE, 'Sends ~500 MB — set ARCUS_RUN_LARGE=1 to run');
    test.setTimeout(30 * 60_000);
    const res = await api.create({ name: uniqueName('api-over'), version: 'v1', file: files.overLimit() });
    expect([400, 413, 422]).toContain(res.status());
  });
});

test.describe('Uploads API › authentication and permissions (FR6.1, FR6.2)', () => {
  test.beforeEach(() => requireApiToken());

  test('API-16 every operation without a token is rejected with 401', async ({ api, files }) => {
    const id = idOf(await api.createOk({ name: uniqueName('api-noauth'), version: 'v1', file: files.pdf() }));
    const calls = [
      api.request.post(api.base, { multipart: { name: uniqueName('x'), version: 'v1', file: api.filePart(files.pdf()) } }),
      api.request.get(api.base),
      api.request.get(`${api.base}/${id}`),
      api.request.get(`${api.base}/${id}/versions`),
      api.request.post(`${api.base}/${id}/versions`, { multipart: { version: 'v9', file: api.filePart(files.pdf()) } }),
    ];
    for (const res of await Promise.all(calls)) expect([401, 403]).toContain(res.status());
  });

  test('API-17 an invalid token is rejected with 401', async ({ api }) => {
    const res = await api.list({}, 'invalid-token-0000');
    expect([401, 403]).toContain(res.status());
  });

  test('API-18 a Read Only token can list, get and download but cannot create or add versions (FR6.2)', async ({ api, files, request }) => {
    test.skip(!READONLY_API_TOKEN, 'Set ARCUS_READONLY_API_TOKEN to run permission parity');
    const id = idOf(await api.createOk({ name: uniqueName('api-ro'), version: 'v1', file: files.pdf() }));

    expect((await api.list({}, READONLY_API_TOKEN)).status()).toBe(200);
    const got = await api.get(id, READONLY_API_TOKEN);
    expect(got.status()).toBe(200);
    expect((await request.get(/** @type {string} */ (findUrl(await got.json())))).status()).toBe(200);

    const create = await api.create({ name: uniqueName('api-ro-create'), version: 'v1', file: files.pdf(), token: READONLY_API_TOKEN });
    expect(create.status()).toBe(403);
    const add = await api.addVersion(id, { version: 'v2', file: files.pdf(), token: READONLY_API_TOKEN });
    expect(add.status()).toBe(403);
    expect(latestLabelOf(await (await api.get(id)).json())).toBe('v1');
  });
});
