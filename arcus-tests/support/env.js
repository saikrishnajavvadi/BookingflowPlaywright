// @ts-check
/**
 * Central configuration for the Arcus Uploads suite. Everything that depends on
 * the environment (URLs, credentials, API paths, limits) is read here so the
 * specs stay free of hard-coded values.
 */
const path = require('path');

const trimSlash = (s) => (s || '').replace(/\/+$/, '');

const BASE_URL = trimSlash(
  process.env.ARCUS_BASE_URL || process.env.BASE_URL || 'https://arcus-edge.testsigma.com',
);

// A stable id for one `playwright test` invocation. The config is loaded in the
// main process first, so setting it here propagates to every worker.
if (!process.env.ARCUS_RUN_ID) {
  process.env.ARCUS_RUN_ID = Date.now().toString(36);
}
const RUN_ID = process.env.ARCUS_RUN_ID;

/** Every file this suite creates starts with this prefix, so teardown can sweep leftovers. */
const NAME_PREFIX = process.env.ARCUS_NAME_PREFIX || 'pw-auto';
const RUN_PREFIX = `${NAME_PREFIX}-${RUN_ID}`;

/**
 * @param {string} role
 * @param {string | undefined} user
 * @param {string | undefined} pass
 */
const creds = (role, user, pass) => (user && pass ? { role, username: user, password: pass } : null);

const ROLES = {
  // Main account: an Account Admin / Developer who can upload and delete.
  admin: creds(
    'admin',
    process.env.ARCUS_USERNAME || process.env.USERNAME,
    process.env.ARCUS_PASSWORD || process.env.PASSWORD,
  ),
  tester: creds('tester', process.env.ARCUS_TESTER_USERNAME, process.env.ARCUS_TESTER_PASSWORD),
  readonly: creds('readonly', process.env.ARCUS_READONLY_USERNAME, process.env.ARCUS_READONLY_PASSWORD),
};

const AUTH_DIR = path.join(__dirname, '..', '.auth');

module.exports = {
  BASE_URL,
  RUN_ID,
  NAME_PREFIX,
  RUN_PREFIX,
  ROLES,
  AUTH_DIR,
  /** @param {keyof typeof ROLES} role */
  authFile: (role) => path.join(AUTH_DIR, `${role}.json`),

  /** Login page path (relative to BASE_URL). */
  LOGIN_PATH: process.env.ARCUS_LOGIN_PATH || '/',
  /**
   * Full or relative URL of one project's Uploads screen. When unset, the suite
   * opens BASE_URL and clicks "Uploads" in the project sidebar.
   */
  UPLOADS_URL: process.env.ARCUS_UPLOADS_URL || '',
  /** Name shown in the "uploaded by" column for the main account (optional check). */
  UPLOADER_DISPLAY_NAME: process.env.ARCUS_UPLOADER_DISPLAY_NAME || '',

  /** FR1.2: 500 MB. Override if the product defines MB as 10^6 bytes. */
  SIZE_LIMIT_BYTES: Number(process.env.ARCUS_SIZE_LIMIT_BYTES || 500 * 1024 * 1024),
  /** Regex (string) for the browser request that carries file bytes; used to simulate a dropped connection. */
  UPLOAD_REQUEST_PATTERN: new RegExp(process.env.ARCUS_UPLOAD_REQUEST_PATTERN || 'upload', 'i'),

  /** Optional Chromium binary (when the installed browser does not match the pinned Playwright). */
  CHROMIUM_PATH: process.env.ARCUS_CHROMIUM_PATH || undefined,

  // --- Uploads API (FR6) ---------------------------------------------------
  API_BASE: trimSlash(process.env.ARCUS_API_BASE || `${BASE_URL}/api/v1`),
  API_UPLOADS_PATH: process.env.ARCUS_API_UPLOADS_PATH || '/uploads',
  API_TOKEN: process.env.ARCUS_API_TOKEN || '',
  READONLY_API_TOKEN: process.env.ARCUS_READONLY_API_TOKEN || '',
  /** Extra query/body field the API needs to scope a call to a project (e.g. "projectId=123"). */
  API_PROJECT_PARAM: process.env.ARCUS_API_PROJECT_PARAM || '',

  // --- Opt-in heavy / data-dependent cases ---------------------------------
  /** Upload a file of exactly SIZE_LIMIT_BYTES (≈500 MB of real transfer). */
  RUN_LARGE: process.env.ARCUS_RUN_LARGE === '1',
  /** Seed 200+ files through the API and search them (FR1.5). */
  RUN_BULK: process.env.ARCUS_RUN_BULK === '1',
  /** Name of an existing upload that at least one test case step references (FR1.7). */
  REFERENCED_FILE: process.env.ARCUS_REFERENCED_FILE || '',
  /** Leave created files in place after the run (debugging). */
  SKIP_CLEANUP: process.env.ARCUS_SKIP_CLEANUP === '1',
};
