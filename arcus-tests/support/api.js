// @ts-check
/**
 * Thin client for the Arcus Uploads API (PRD FR6.1: create a file, add a new
 * version, get one file, list files, list versions).
 *
 * The PRD does not fix paths or field names, so paths come from env.js and
 * responses are read defensively (see pick/findUrl). Adjust here if the real
 * contract differs.
 */
const fs = require('fs');
const path = require('path');
const { API_BASE, API_UPLOADS_PATH, API_PROJECT_PARAM } = require('./env');

const projectParams = () => Object.fromEntries(new URLSearchParams(API_PROJECT_PARAM));

/** First defined value among `keys`, looking in obj and obj.data. */
function pick(obj, keys) {
  for (const src of [obj, obj && obj.data]) {
    if (!src || typeof src !== 'object') continue;
    for (const k of keys) if (src[k] !== undefined && src[k] !== null) return src[k];
  }
  return undefined;
}

/** First http(s) URL found anywhere in a JSON value whose key looks like a download link. */
function findUrl(value, keyHint = /url|link|download/i) {
  if (!value || typeof value !== 'object') return undefined;
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v) && keyHint.test(k)) return v;
    const nested = findUrl(v, keyHint);
    if (nested) return nested;
  }
  return undefined;
}

/** Array of items from a list response (plain array, or under content/data/items/results). */
function items(body) {
  if (Array.isArray(body)) return body;
  for (const k of ['content', 'data', 'items', 'results', 'uploads', 'versions']) {
    if (Array.isArray(body?.[k])) return body[k];
    if (Array.isArray(body?.data?.[k])) return body.data[k];
  }
  return [];
}

const idOf = (o) => pick(o, ['id', 'uploadId', 'fileId', 'uuid']);
const nameOf = (o) => pick(o, ['name', 'fileName', 'displayName']);
const versionLabelOf = (o) => pick(o, ['version', 'versionLabel', 'label', 'versionName']);
const latestLabelOf = (o) => {
  const latest = pick(o, ['latestVersion', 'latest', 'currentVersion']);
  return latest && typeof latest === 'object' ? versionLabelOf(latest) : latest;
};

class UploadsApi {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   * @param {string} [token]
   */
  constructor(request, token) {
    this.request = request;
    this.token = token;
    this.base = `${API_BASE}${API_UPLOADS_PATH}`;
  }

  headers(token = this.token) {
    return token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' };
  }

  filePart(filePath) {
    return { name: path.basename(filePath), mimeType: 'application/octet-stream', buffer: fs.readFileSync(filePath) };
  }

  /** @param {{ name?: string, version?: string, file?: string, token?: string }} p */
  create({ name, version, file, token }) {
    /** @type {Record<string, any>} */
    const multipart = { ...projectParams() };
    if (name !== undefined) multipart.name = name;
    if (version !== undefined) multipart.version = version;
    if (file) multipart.file = this.filePart(file);
    return this.request.post(this.base, { headers: this.headers(token), multipart });
  }

  /** @param {string} id @param {{ version?: string, file?: string, token?: string }} p */
  addVersion(id, { version, file, token }) {
    /** @type {Record<string, any>} */
    const multipart = { ...projectParams() };
    if (version !== undefined) multipart.version = version;
    if (file) multipart.file = this.filePart(file);
    return this.request.post(`${this.base}/${encodeURIComponent(id)}/versions`, { headers: this.headers(token), multipart });
  }

  get(id, token) {
    return this.request.get(`${this.base}/${encodeURIComponent(id)}`, { headers: this.headers(token), params: projectParams() });
  }

  list(params = {}, token) {
    return this.request.get(this.base, { headers: this.headers(token), params: { ...projectParams(), ...params } });
  }

  listVersions(id, token) {
    return this.request.get(`${this.base}/${encodeURIComponent(id)}/versions`, {
      headers: this.headers(token),
      params: projectParams(),
    });
  }

  /** Creates a file and returns its parsed body, failing loudly on a non-2xx. */
  async createOk(p) {
    const res = await this.create(p);
    if (!res.ok()) throw new Error(`create ${p.name} → ${res.status()} ${await res.text()}`);
    return res.json();
  }
}

/**
 * Seconds a signed URL stays valid, from common signing schemes
 * (AWS SigV4 X-Amz-Expires, legacy S3/CloudFront Expires, GCS, Azure SAS).
 * Returns undefined when the scheme is unknown.
 * @param {string} url
 */
function signedUrlTtlSeconds(url) {
  const q = new URL(url).searchParams;
  const get = (k) => {
    for (const [key, v] of q) if (key.toLowerCase() === k.toLowerCase()) return v;
    return null;
  };
  if (get('X-Amz-Expires')) return Number(get('X-Amz-Expires'));
  if (get('X-Goog-Expires')) return Number(get('X-Goog-Expires'));
  const nowSec = Date.now() / 1000;
  if (get('Expires') && /^\d+$/.test(get('Expires') || '')) return Number(get('Expires')) - nowSec;
  if (get('se')) return Date.parse(get('se') || '') / 1000 - nowSec; // Azure SAS
  return undefined;
}

/** The signed URL with its signature altered (to prove signatures are enforced). */
function tamperSignature(url) {
  const u = new URL(url);
  for (const k of ['X-Amz-Signature', 'Signature', 'X-Goog-Signature', 'sig']) {
    const v = u.searchParams.get(k);
    if (v) {
      u.searchParams.set(k, (v[0] === 'a' ? 'b' : 'a') + v.slice(1));
      return u.toString();
    }
  }
  return undefined;
}

module.exports = { UploadsApi, pick, items, idOf, nameOf, versionLabelOf, latestLabelOf, findUrl, signedUrlTtlSeconds, tamperSignature };
