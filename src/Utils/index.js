'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
//  ID GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a WA-style message ID: '3EB0' + 16 hex chars */
function generateMessageID() {
  return '3EB0' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

function generateUUID() {
  return uuidv4();
}

// ─────────────────────────────────────────────────────────────────────────────
//  CRYPTO
// ─────────────────────────────────────────────────────────────────────────────

function hmacSign(key, data)              { return crypto.createHmac('sha256', key).update(data).digest(); }
function sha256(data)                      { return crypto.createHash('sha256').update(data).digest(); }
function randomBytes(n)                    { return crypto.randomBytes(n); }

function aesDecryptCBC(key, iv, ct) {
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([d.update(ct), d.final()]);
}

function aesEncryptCBC(key, iv, pt) {
  const c = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([c.update(pt), c.final()]);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MISC
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unixTimestampSeconds() { return Math.floor(Date.now() / 1000); }

function normalizePhoneNumber(phone) { return String(phone).replace(/\D/g, ''); }

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

module.exports = {
  generateMessageID,
  generateUUID,
  hmacSign,
  sha256,
  randomBytes,
  aesDecryptCBC,
  aesEncryptCBC,
  sleep,
  unixTimestampSeconds,
  normalizePhoneNumber,
  safeJsonParse,
};
