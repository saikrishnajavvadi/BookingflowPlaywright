// @ts-check
/**
 * Builds the files the tests upload. Files are generated per test (under the
 * test's output folder) so nothing binary is committed and every test gets
 * unique content.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RUN_PREFIX, SIZE_LIMIT_BYTES } = require('./env');

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const JPEG_1X1 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////////////////////////' +
  '//////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const EMPTY_ZIP = Buffer.concat([Buffer.from('PK\x05\x06', 'binary'), Buffer.alloc(18)]);

/** Minimal valid one-page PDF; `marker` makes each file's bytes unique. */
const pdf = (marker) =>
  Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
      `% ${marker}\n` +
      'trailer<</Root 1 0 R>>\n%%EOF\n',
  );

/**
 * EICAR anti-malware test signature (harmless by design). Assembled at runtime
 * so this source file is not itself flagged by scanners.
 */
const eicar = () =>
  Buffer.from(
    ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!', '$H+H*'].join(''),
  );

let counter = 0;

/** Unique, sweepable upload Name, e.g. "pw-auto-lq3k2-resume-7f3a". */
function uniqueName(label) {
  counter += 1;
  return `${RUN_PREFIX}-${label}-${counter}${crypto.randomBytes(2).toString('hex')}`;
}

class FileFactory {
  /** @param {string} dir */
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * Writes `content` to `<dir>/<n>/<fileName>` (sub-folder keeps on-disk names
   * exact while allowing the same name twice in one test).
   * @param {string} fileName
   * @param {Buffer | string} content
   */
  write(fileName, content) {
    const sub = path.join(this.dir, String(++counter));
    fs.mkdirSync(sub, { recursive: true });
    const full = path.join(sub, fileName);
    fs.writeFileSync(full, content);
    return full;
  }

  /** Sparse file of an exact size — created instantly, no disk used. */
  sized(fileName, bytes) {
    const sub = path.join(this.dir, String(++counter));
    fs.mkdirSync(sub, { recursive: true });
    const full = path.join(sub, fileName);
    const fd = fs.openSync(full, 'w');
    fs.ftruncateSync(fd, bytes);
    fs.closeSync(fd);
    return full;
  }

  marker() {
    return `${RUN_PREFIX}-${crypto.randomBytes(6).toString('hex')}`;
  }

  pdf(fileName = 'invoice.pdf') {
    return this.write(fileName, pdf(this.marker()));
  }
  png(fileName = 'gate_boarding_qr.png') {
    // Append a tEXt-free trailer after IEND so content is unique but still decodes.
    return this.write(fileName, Buffer.concat([Buffer.from(PNG_1X1, 'base64'), Buffer.from(this.marker())]));
  }
  jpg(fileName = 'photo.jpg') {
    return this.write(fileName, Buffer.concat([Buffer.from(JPEG_1X1, 'base64'), Buffer.from(this.marker())]));
  }
  csv(fileName = 'fare_matrix.csv') {
    return this.write(fileName, `route,fare\nHYD-BLR,${Math.floor(Math.random() * 9000) + 1000}\n# ${this.marker()}\n`);
  }
  text(fileName = 'notes.txt') {
    return this.write(fileName, `plain text ${this.marker()}\n`);
  }
  zip(fileName = 'bundle.zip') {
    return this.write(fileName, EMPTY_ZIP);
  }
  empty(fileName = 'empty.txt') {
    return this.write(fileName, '');
  }
  eicar(fileName = 'eicar-test.txt') {
    return this.write(fileName, eicar());
  }
  overLimit(fileName = 'over-limit.bin') {
    return this.sized(fileName, SIZE_LIMIT_BYTES + 1);
  }
  atLimit(fileName = 'at-limit.bin') {
    return this.sized(fileName, SIZE_LIMIT_BYTES);
  }
}

/** "1.5 KB"-style text check: any size with a unit. */
const SIZE_TEXT = /\d+(\.\d+)?\s*(B|bytes|KB|KiB|MB|MiB|GB)\b/i;

/** Human-readable MB the error message is expected to mention for a given byte count. */
const mbPattern = (bytes) => {
  const mib = bytes / (1024 * 1024);
  const mb = bytes / 1e6;
  const fmt = (n) => [n.toFixed(0), n.toFixed(1), n.toFixed(2)].map((s) => s.replace('.', '\\.'));
  return new RegExp(`(${[...fmt(mib), ...fmt(mb)].join('|')})\\s*(MB|MiB)`, 'i');
};

module.exports = { FileFactory, uniqueName, SIZE_TEXT, mbPattern };
