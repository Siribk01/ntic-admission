// src/utils/fileStorage.js
// Saving, reading and deleting uploaded files on disk.
// Files get a random server-made name. The name the user's computer gave is never used as a path.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));

// What the file REALLY is, judged by its first bytes, not by the name or the type the browser claims.
function detectType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && png.every((byte, i) => buffer[i] === byte)) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  return null;
}

async function save(buffer, ext) {
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const storedName = `${crypto.randomUUID()}.${ext}`;
  // wx = fail if the file somehow already exists, never overwrite
  await fs.promises.writeFile(path.join(UPLOAD_DIR, storedName), buffer, { flag: 'wx' });
  return {
    storedName,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

// storedName always comes from our own database, but path.basename makes a path trick impossible anyway
const pathOf = (storedName) => path.join(UPLOAD_DIR, path.basename(storedName));

function openRead(storedName) {
  return fs.createReadStream(pathOf(storedName));
}

async function remove(storedName) {
  try {
    await fs.promises.unlink(pathOf(storedName));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not delete file', storedName, err.message);
  }
}

module.exports = { UPLOAD_DIR, detectType, save, openRead, remove };
