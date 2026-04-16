'use strict';

const crypto    = require('crypto');
const fs        = require('fs');
const nodePath  = require('path');
const axios     = require('axios');
const mimeTypes = require('mime-types');

/**
 * Resolve any media input to a Buffer.
 * Accepts: Buffer | local file path (string) | HTTP(S) URL (string)
 */
async function resolveMedia(media) {
  if (Buffer.isBuffer(media)) return media;
  if (typeof media !== 'string') throw new TypeError(`resolveMedia: expected Buffer or string, got ${typeof media}`);

  if (/^https?:\/\//i.test(media)) {
    const res = await axios.get(media, { responseType: 'arraybuffer', timeout: 30_000 });
    return Buffer.from(res.data);
  }
  return fs.promises.readFile(media);
}

/** Compute SHA-256 and byte length of a buffer. */
function computeMediaHashes(buf) {
  return { fileSha256: crypto.createHash('sha256').update(buf).digest(), fileLength: buf.length };
}

/** Guess MIME type from file path string or buffer magic bytes. */
function guessMimeType(input) {
  if (typeof input === 'string') return mimeTypes.lookup(input) || 'application/octet-stream';
  if (Buffer.isBuffer(input)) {
    if (input[0] === 0xff && input[1] === 0xd8)                        return 'image/jpeg';
    if (input[0] === 0x89 && input[1] === 0x50)                        return 'image/png';
    if (input[0] === 0x47 && input[1] === 0x49)                        return 'image/gif';
    if (input[0] === 0x52 && input[4] === 0x57)                        return 'image/webp';
    if (input[0] === 0x1a && input[1] === 0x45)                        return 'video/webm';
    if (input[4] === 0x66 && input[5] === 0x74)                        return 'video/mp4';
    if (input[0] === 0x49 && input[1] === 0x44)                        return 'audio/mpeg';
    if (input[0] === 0x4f && input[1] === 0x67)                        return 'audio/ogg';
    if (input[0] === 0x25 && input[1] === 0x50)                        return 'application/pdf';
  }
  return 'application/octet-stream';
}

/** Map MIME type to WA media type string. */
function mediaTypeFromMime(mime) {
  if (!mime) return 'document';
  if (mime === 'image/webp')     return 'sticker';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Download + decrypt WA media from a WAMessage.
 * NOTE: Full WA CDN decryption (mediaKey AES-256-CBC) not implemented in stub.
 * For direct HTTP URLs (e.g. during testing) this will work.
 */
async function downloadMediaMessage(message) {
  const types = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  let mediaMsg;
  for (const t of types) { if (message?.message?.[t]) { mediaMsg = message.message[t]; break; } }
  if (!mediaMsg) throw new Error('No media in message');

  const url = mediaMsg.url || mediaMsg.directPath;
  if (!url) throw new Error('No download URL');
  if (/^https?:\/\//i.test(url)) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60_000 });
    return Buffer.from(res.data);
  }
  throw new Error('CDN decryption requires mediaKey — not implemented in stub');
}

/** Download and save media to disk. Returns the file path. */
async function saveMedia(message, outputDir, filename) {
  const buf  = await downloadMediaMessage(message);
  const types = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  let mime = 'application/octet-stream';
  for (const t of types) { if (message?.message?.[t]?.mimetype) { mime = message.message[t].mimetype; break; } }
  const ext  = mimeTypes.extension(mime) || 'bin';
  const name = filename || `media_${Date.now()}.${ext}`;
  const fp   = nodePath.join(outputDir, name);
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(fp, buf);
  return fp;
}

module.exports = { resolveMedia, computeMediaHashes, guessMimeType, mediaTypeFromMime, downloadMediaMessage, saveMedia };
