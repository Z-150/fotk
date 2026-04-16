'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────
//  ID GENERATORS
// ─────────────────────────────────────────────

/**
 * Generate a random WhatsApp-style message ID.
 * Format: 3EB0XXXXXXXXXXXXXXXX (uppercase hex, 20 chars)
 */
function generateMessageID() {
  return '3EB0' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * Generate a random UUIDv4.
 */
function generateUUID() {
  return uuidv4();
}

// ─────────────────────────────────────────────
//  CRYPTO HELPERS
// ─────────────────────────────────────────────

/**
 * HMAC-SHA256
 * @param {Buffer} key
 * @param {Buffer} data
 * @returns {Buffer}
 */
function hmacSign(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * SHA256 hash
 * @param {Buffer|string} data
 * @returns {Buffer}
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * AES-256-CBC decrypt
 * @param {Buffer} key
 * @param {Buffer} iv
 * @param {Buffer} ciphertext
 * @returns {Buffer}
 */
function aesDecryptCBC(key, iv, ciphertext) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * AES-256-CBC encrypt
 */
function aesEncryptCBC(key, iv, plaintext) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

// ─────────────────────────────────────────────
//  BINARY HELPERS
// ─────────────────────────────────────────────

/**
 * Convert a number to a fixed-width big-endian Buffer.
 * @param {number} num
 * @param {number} bytes
 */
function intToBuffer(num, bytes = 4) {
  const buf = Buffer.alloc(bytes);
  buf.writeUIntBE(num, 0, bytes);
  return buf;
}

/**
 * Read big-endian uint from Buffer.
 */
function bufferToInt(buf) {
  return buf.readUIntBE(0, buf.length);
}

/**
 * Generate random bytes as Buffer.
 */
function randomBytes(n) {
  return crypto.randomBytes(n);
}

// ─────────────────────────────────────────────
//  MISC
// ─────────────────────────────────────────────

/**
 * Sleep helper.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely parse JSON, return null on error.
 * @param {string} str
 */
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Deep clone an object via JSON round-trip.
 * @param {*} obj
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Delay with exponential back-off.
 * @param {number} attempt  0-indexed attempt number
 * @param {number} base     Base delay in ms (default 2000)
 */
function backoff(attempt, base = 2000) {
  return Math.min(base * Math.pow(2, attempt), 60000);
}

/**
 * Get current Unix timestamp in seconds.
 */
function unixTimestampSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Pad a buffer to a fixed length.
 * @param {Buffer} buf
 * @param {number} len
 * @param {number} fill  Fill byte value
 */
function padBuffer(buf, len, fill = 0) {
  if (buf.length >= len) return buf;
  const padded = Buffer.alloc(len, fill);
  buf.copy(padded, len - buf.length);
  return padded;
}

/**
 * Convert a phone number to WA-compatible format (strip '+', spaces, dashes).
 * @param {string} phone
 * @returns {string}
 */
function normalizePhoneNumber(phone) {
  return phone.replace(/[^0-9]/g, '');
}

module.exports = {
  generateMessageID,
  generateUUID,
  hmacSign,
  sha256,
  aesDecryptCBC,
  aesEncryptCBC,
  intToBuffer,
  bufferToInt,
  randomBytes,
  sleep,
  safeJsonParse,
  deepClone,
  backoff,
  unixTimestampSeconds,
  padBuffer,
  normalizePhoneNumber,
};
