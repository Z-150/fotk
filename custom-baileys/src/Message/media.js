'use strict';

const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');
const axios     = require('axios');
const mimeTypes = require('mime-types');

// ─────────────────────────────────────────────
//  MEDIA UPLOAD HELPERS
// ─────────────────────────────────────────────

/**
 * Resolve media to a Buffer regardless of whether input is:
 *   - A Buffer
 *   - A local file path (string)
 *   - A remote URL (string starting with http/https)
 *
 * @param {Buffer|string} media
 * @returns {Promise<Buffer>}
 */
async function resolveMedia(media) {
  if (Buffer.isBuffer(media)) return media;

  if (typeof media === 'string') {
    if (/^https?:\/\//i.test(media)) {
      const response = await axios.get(media, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    }
    // Local file path
    return fs.promises.readFile(media);
  }

  throw new TypeError('media must be a Buffer, file path, or URL string');
}

/**
 * Compute the SHA-256 and encrypted SHA-256 of a media Buffer.
 * (Matches what WA expects in the message object.)
 *
 * @param {Buffer} buf
 * @returns {{ fileSha256: Buffer, fileLength: number }}
 */
function computeMediaHashes(buf) {
  return {
    fileSha256: crypto.createHash('sha256').update(buf).digest(),
    fileLength: buf.length,
  };
}

/**
 * Guess MIME type from a file path or buffer header.
 * @param {string|Buffer} input
 * @returns {string}
 */
function guessMimeType(input) {
  if (typeof input === 'string') {
    return mimeTypes.lookup(input) || 'application/octet-stream';
  }
  // Buffer: check magic bytes for common types
  if (Buffer.isBuffer(input)) {
    if (input[0] === 0xff && input[1] === 0xd8) return 'image/jpeg';
    if (input[0] === 0x89 && input[1] === 0x50) return 'image/png';
    if (input[0] === 0x47 && input[1] === 0x49) return 'image/gif';
    if (input[0] === 0x52 && input[4] === 0x57) return 'image/webp';
    if (input[0] === 0x1a && input[1] === 0x45) return 'video/webm';
    if (input[4] === 0x66 && input[5] === 0x74) return 'video/mp4';
    if (input[0] === 0x49 && input[1] === 0x44) return 'audio/mpeg';
    if (input[0] === 0x4f && input[1] === 0x67) return 'audio/ogg';
    if (input[0] === 0x25 && input[1] === 0x50) return 'application/pdf';
  }
  return 'application/octet-stream';
}

/**
 * Determine the WA media type string from a MIME type.
 * @param {string} mime
 * @returns {'image'|'video'|'audio'|'document'|'sticker'}
 */
function mediaTypeFromMime(mime) {
  if (!mime) return 'document';
  if (mime === 'image/webp') return 'sticker';
  if (mime.startsWith('image/'))  return 'image';
  if (mime.startsWith('video/'))  return 'video';
  if (mime.startsWith('audio/'))  return 'audio';
  return 'document';
}

// ─────────────────────────────────────────────
//  MEDIA DOWNLOAD HELPER
// ─────────────────────────────────────────────

/**
 * Download media from a WA media message.
 * Returns the decrypted media Buffer.
 *
 * In a full implementation, this function would:
 *   1. Fetch the encrypted blob from `directPath` on WA CDN.
 *   2. Decrypt with the `mediaKey` using AES-256-CBC + HMAC-SHA256.
 *   3. Verify the file hash.
 *
 * This stub demonstrates the interface; integrate `@whiskeysockets/baileys`
 * media helpers or implement WA media decryption for production use.
 *
 * @param {object} message   WAMessage (the full message object)
 * @param {'image'|'video'|'audio'|'document'|'sticker'} [type]
 * @returns {Promise<Buffer>}
 */
async function downloadMediaMessage(message, type) {
  // Extract media message node
  const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  let mediaMsg;
  for (const t of mediaTypes) {
    if (message?.message?.[t]) { mediaMsg = message.message[t]; break; }
  }

  if (!mediaMsg) throw new Error('No media found in message');

  const url = mediaMsg.url || mediaMsg.directPath;
  if (!url) throw new Error('No download URL in media message');

  // For direct HTTP URLs (e.g. from uploadMedia stub)
  if (/^https?:\/\//i.test(url)) {
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
  }

  throw new Error('Media decryption from WA CDN not implemented in stub — provide real mediaKey decryption.');
}

/**
 * Save downloaded media to disk.
 * @param {object} message
 * @param {string} outputDir
 * @param {string} [filename]
 * @returns {Promise<string>} Full path to saved file
 */
async function saveMedia(message, outputDir, filename) {
  const buf = await downloadMediaMessage(message);

  const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  let mime = 'application/octet-stream';
  for (const t of mediaTypes) {
    if (message?.message?.[t]?.mimetype) { mime = message.message[t].mimetype; break; }
  }

  const ext      = mimeTypes.extension(mime) || 'bin';
  const name     = filename || `media_${Date.now()}.${ext}`;
  const fullPath = path.join(outputDir, name);

  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(fullPath, buf);

  return fullPath;
}

module.exports = {
  resolveMedia,
  computeMediaHashes,
  guessMimeType,
  mediaTypeFromMime,
  downloadMediaMessage,
  saveMedia,
};
