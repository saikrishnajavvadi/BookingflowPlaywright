// @ts-check
/**
 * Page objects for Arcus login and the Uploads screen.
 *
 * SELECTORS: built from the wording in "Arcus Uploads — Phase 1 PRD" (§4, §8
 * flows A–G) using role/label/text locators. They have NOT yet been checked
 * against the live DOM — if a test fails on a locator, fix it here once and
 * every spec picks it up.
 */
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');
const { BASE_URL, UPLOADS_URL, LOGIN_PATH } = require('./env');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Matches `text` as a whole token (so "v1" does not match "v10"). */
const exact = (text) => new RegExp(`(^|[^\\w-])${esc(text)}($|[^\\w-])`);

const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Logs into Arcus. Handles both single-page (user + password) and two-step
 * (user → Continue → password) login forms.
 * @param {import('@playwright/test').Page} page
 * @param {{ username: string, password: string }} user
 */
async function login(page, user) {
  await page.goto(`${BASE_URL}${LOGIN_PATH}`);

  const userField = page
    .locator('input[type="email"], input[name="username"], input[name="email"], input#username, input#email')
    .first();
  const passwordField = page.locator('input[type="password"]').first();
  const submit = page
    .getByRole('button', { name: /^(sign in|log in|login|continue|next)$/i })
    .or(page.locator('button[type="submit"]'))
    .first();

  await userField.fill(user.username);
  if (!(await passwordField.isVisible())) {
    await submit.click(); // two-step login
  }
  await passwordField.fill(user.password);
  await submit.click();

  await expect(passwordField, `login failed for the "${user.username}" account`).toBeHidden({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

// ---------------------------------------------------------------------------
// Upload dialog (Flow A)
// ---------------------------------------------------------------------------

class UploadDialog {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.root = page.getByRole('dialog').filter({ has: page.locator('input[type="file"]') }).last();
    this.fileInput = this.root.locator('input[type="file"]');
    this.dropZone = this.root.getByText(/drag|drop/i).first();
    this.browse = this.root.getByRole('button', { name: /browse/i }).or(this.root.getByText(/browse/i)).first();
    this.name = this.root.getByLabel(/^name/i).or(this.root.getByPlaceholder(/name/i)).first();
    this.version = this.root.getByLabel(/version/i).or(this.root.getByPlaceholder(/version|v1/i)).first();
    this.submit = this.root.getByRole('button', { name: /^upload( file| version)?$/i }).last();
    this.cancel = this.root.getByRole('button', { name: /^cancel$/i });
    this.close = this.root.getByRole('button', { name: /close/i }).first();
    this.progress = this.root.getByRole('progressbar').or(this.root.getByText(/uploading|\d+\s*%/i)).first();
    this.retry = page.getByRole('button', { name: /retry|try again/i }).first();
    this.uploadAsNewVersion = page
      .getByRole('button', { name: /upload as new version/i })
      .or(page.getByRole('link', { name: /upload as new version/i }))
      .first();
  }

  /** Text shown anywhere in the dialog (inline errors, file name/size, etc). */
  text(re) {
    return this.root.getByText(re).first();
  }

  async expectOpen() {
    await expect(this.root).toBeVisible();
  }

  /** Browse path: picks the file through the native chooser when there is a Browse control. */
  async browseFile(filePath) {
    if (await this.browse.isVisible().catch(() => false)) {
      const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), this.browse.click()]);
      await chooser.setFiles(filePath);
    } else {
      await this.fileInput.setInputFiles(filePath);
    }
  }

  /** Drag-and-drop path: dispatches real drag events carrying a File in a DataTransfer. */
  async dropFile(filePath) {
    const b64 = fs.readFileSync(filePath).toString('base64');
    const name = path.basename(filePath);
    const type = MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
    const dataTransfer = await this.page.evaluateHandle(
      ({ b64, name, type }) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bin], name, { type }));
        return dt;
      },
      { b64, name, type },
    );
    for (const event of ['dragenter', 'dragover', 'drop']) {
      await this.dropZone.dispatchEvent(event, { dataTransfer });
    }
  }

  /**
   * @param {{ file?: string, name?: string, version?: string, via?: 'browse' | 'drop' }} opts
   */
  async fill({ file, name, version, via = 'browse' }) {
    if (file) {
      if (via === 'drop') await this.dropFile(file);
      else await this.browseFile(file);
      // Flow A.2: the dialog echoes the chosen file's name.
      await expect(this.text(path.basename(file))).toBeVisible();
    }
    if (name !== undefined && (await this.name.isEditable())) await this.name.fill(name);
    if (version !== undefined) await this.version.fill(version);
  }

  async submitAndWaitClosed() {
    await this.submit.click();
    await expect(this.root).toBeHidden({ timeout: 60_000 });
  }

  /**
   * Asserts the dialog refuses to proceed: Upload is disabled, or clicking it
   * shows `message` and keeps the dialog open.
   * @param {RegExp} [message]
   */
  async expectBlocked(message) {
    if (await this.submit.isEnabled()) await this.submit.click();
    if (message) await expect(this.text(message)).toBeVisible();
    await expect(this.root).toBeVisible();
  }
}

// ---------------------------------------------------------------------------
// File side panel (Flow B): Versions, Used by, Activity, Reference & API
// ---------------------------------------------------------------------------

class FilePanel {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.root = page
      .getByRole('dialog')
      .or(page.getByRole('complementary'))
      .or(page.locator('aside, [class*="drawer" i], [class*="panel" i]'))
      .filter({ has: page.getByRole('tab', { name: /versions/i }) })
      .last();
    this.uploadNewVersion = this.root.getByRole('button', { name: /upload new version/i });
    this.deleteFile = this.root.getByRole('button', { name: /^delete( file)?$/i });
    this.getDownloadLink = this.root.getByRole('button', { name: /get download link/i });
    this.copyReference = this.root.getByRole('button', { name: /copy/i }).first();
    this.close = this.root.getByRole('button', { name: /close/i }).first();
  }

  /** @param {'Versions' | 'Used by' | 'Activity' | 'Reference & API'} name */
  tab(name) {
    return this.root.getByRole('tab', { name: new RegExp(`^${esc(name)}`, 'i') });
  }

  async openTab(name) {
    await this.tab(name).click();
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true');
  }

  rows() {
    return this.root.getByRole('row').or(this.root.getByRole('listitem'));
  }

  versionRow(label) {
    return this.rows().filter({ hasText: exact(label) }).first();
  }

  async expectLatest(label) {
    await this.openTab('Versions');
    await expect(this.versionRow(label).getByText(/latest/i)).toBeVisible();
  }

  async expectNotLatest(label) {
    await this.openTab('Versions');
    await expect(this.versionRow(label).getByText(/latest/i)).toHaveCount(0);
  }

  /** Opens the per-version actions and clicks Delete. Returns the confirm dialog. */
  async startDeleteVersion(label) {
    await this.openTab('Versions');
    const row = this.versionRow(label);
    const direct = row.getByRole('button', { name: /delete/i });
    if (await direct.isVisible().catch(() => false)) {
      await direct.click();
    } else {
      await row.getByRole('button', { name: /more|actions|options|menu/i }).or(row.getByRole('button').last()).first().click();
      await this.page.getByRole('menuitem', { name: /delete/i }).click();
    }
    return new ConfirmDialog(this.page);
  }

  /** The file ID text shown on Reference & API. */
  async fileId() {
    await this.openTab('Reference & API');
    const labelled = this.root.getByText(/^\s*(file\s*)?id\s*:?\s*$/i).first().locator('xpath=following-sibling::*[1]');
    const text = (await labelled.innerText().catch(() => '')).trim();
    if (text) return text;
    const inline = await this.root.getByText(/\bid\s*[:#]\s*\S+/i).first().innerText();
    return inline.replace(/.*\bid\s*[:#]\s*/i, '').trim();
  }

  /** Clicks "Get download link" and returns the signed URL (from link, input, or clipboard). */
  async downloadUrl() {
    await this.openTab('Reference & API');
    await this.getDownloadLink.click();
    const link = this.root.locator('a[href^="http"]:not([href*="docs"]), input[value^="http"]').last();
    await expect(link).toBeVisible();
    const href = (await link.getAttribute('href')) || (await link.inputValue());
    if (href) return href;
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  async closePanel() {
    if (await this.close.isVisible().catch(() => false)) await this.close.click();
    else await this.page.keyboard.press('Escape');
    await expect(this.root).toBeHidden();
  }
}

// ---------------------------------------------------------------------------
// Confirm dialog (delete flows)
// ---------------------------------------------------------------------------

class ConfirmDialog {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.root = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: /delete/i }).last();
    this.confirm = this.root.getByRole('button', { name: /^(delete|confirm|yes)/i }).last();
    this.cancel = this.root.getByRole('button', { name: /^(cancel|no|keep)/i }).first();
  }
  async accept() {
    await expect(this.root).toBeVisible();
    await this.confirm.click();
    await expect(this.root).toBeHidden();
  }
  async dismiss() {
    await expect(this.root).toBeVisible();
    await this.cancel.click();
    await expect(this.root).toBeHidden();
  }
}

// ---------------------------------------------------------------------------
// Uploads screen (library list)
// ---------------------------------------------------------------------------

class UploadsPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.sidebarLink = page.getByRole('link', { name: /^uploads$/i }).first();
    this.heading = page.getByRole('heading', { name: /uploads/i }).first();
    this.uploadButton = page.getByRole('button', { name: /^(\+\s*)?upload( file)?$/i }).first();
    this.search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first();
    this.emptyState = page.getByText(/no (files|uploads|results|matching)|nothing (found|here)/i).first();
    this.dialog = new UploadDialog(page);
    this.panel = new FilePanel(page);
  }

  async goto() {
    if (UPLOADS_URL) {
      await this.page.goto(UPLOADS_URL.startsWith('http') ? UPLOADS_URL : `${BASE_URL}${UPLOADS_URL}`);
    } else {
      await this.page.goto(BASE_URL);
      await this.sidebarLink.click();
    }
    await expect(this.heading).toBeVisible();
  }

  /** Table row (or card) for a file, matched on its Name. */
  row(name) {
    return this.page.getByRole('row').or(this.page.getByRole('listitem')).filter({ hasText: exact(name) }).first();
  }

  async openUploadDialog() {
    await this.uploadButton.click();
    await this.dialog.expectOpen();
    return this.dialog;
  }

  /**
   * Full happy-path upload (Flow A).
   * @param {{ file: string, name: string, version: string, via?: 'browse' | 'drop' }} opts
   */
  async upload(opts) {
    await this.openUploadDialog();
    await this.dialog.fill(opts);
    await this.dialog.submitAndWaitClosed();
    await expect(this.row(opts.name)).toBeVisible();
  }

  async searchFor(text) {
    await this.search.fill(text);
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async clearSearch() {
    await this.search.fill('');
    await this.page.waitForLoadState('networkidle').catch(() => {});
  }

  async openPanel(name) {
    await this.row(name).getByText(exact(name)).first().click();
    await expect(this.panel.root).toBeVisible();
    return this.panel;
  }

  /** Flow A from the panel: Upload new version with Name locked. */
  async uploadNewVersion(name, { file, version }) {
    const panel = await this.openPanel(name);
    await panel.uploadNewVersion.click();
    await this.dialog.expectOpen();
    await expect(this.dialog.name).not.toBeEditable();
    await this.dialog.fill({ file, version });
    await this.dialog.submitAndWaitClosed();
    return panel;
  }

  /** Starts deleting a file from its row menu (falls back to the panel). Returns the confirm dialog. */
  async startDelete(name) {
    const row = this.row(name);
    const menu = row.getByRole('button', { name: /more|actions|options|menu/i }).first();
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
      await this.page.getByRole('menuitem', { name: /delete/i }).click();
    } else {
      const panel = await this.openPanel(name);
      await panel.deleteFile.click();
    }
    return new ConfirmDialog(this.page);
  }

  async deleteFile(name) {
    const confirm = await this.startDelete(name);
    await confirm.accept();
    await expect(this.row(name)).toBeHidden();
  }
}

module.exports = { login, UploadsPage, UploadDialog, FilePanel, ConfirmDialog, exact };
