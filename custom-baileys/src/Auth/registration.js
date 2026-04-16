'use strict';

const crypto = require('crypto');
const { generateUUID, randomBytes } = require('../Utils');

/**
 * generateRegistrationNode
 * ────────────────────────
 * Produces the initial credentials object for a fresh WA MD session.
 * All crypto keys are generated locally; the actual WA handshake will
 * exchange the Noise public keys with the server on first connect.
 */
function generateRegistrationNode() {
  // Curve25519 key pair (Noise static keys)
  const noiseKey       = generateCurve25519KeyPair();
  // Signed identity key pair (used in Signal handshake)
  const signedIdentityKey = generateCurve25519KeyPair();
  // Registration identity key (same curve)
  const registrationId = (crypto.randomBytes(2).readUInt16BE(0) & 0x3fff) + 1;

  return {
    noiseKey,
    signedIdentityKey,
    signedPreKey: generateSignedPreKey(signedIdentityKey, 1),
    registrationId,
    advSecretKey: randomBytes(32).toString('base64'),
    processedHistoryMessages: [],
    nextPreKeyId: 1,
    firstUnuploadedPreKeyId: 1,
    serverHasPreKeys: false,
    account: undefined,
    me: undefined,
    signalIdentities: [],
    myAppStateKeyId: undefined,
    firstAppStateSyncKeyUpdate: undefined,
    lastAppStateStats: undefined,
    lastAccountSyncTimestamp: undefined,
    platform: 'smba',   // WA Web platform string
    routingInfo: undefined,
    pairingCode: undefined,
  };
}

// ─────────────────────────────────────────────
//  CURVE25519 KEY HELPERS
// ─────────────────────────────────────────────

/**
 * Generate a Curve25519 key pair.
 * Returns { private: Buffer, public: Buffer }.
 *
 * NOTE: In production, use a proper Curve25519 library (e.g. curve25519-js).
 *       Here we fall back to random bytes for structural completeness.
 */
function generateCurve25519KeyPair() {
  // Attempt to use curve25519-js if installed, otherwise stub.
  let curve;
  try {
    curve = require('curve25519-js');
  } catch {
    // Stubbed fallback — replace with real Curve25519 in production
    const priv = crypto.randomBytes(32);
    const pub  = crypto.randomBytes(32);
    return {
      private: priv,
      public:  pub,
      keyType: 'curve25519',
    };
  }

  const seed = crypto.randomBytes(32);
  const { private: priv, public: pub } = curve.generateKeyPair(seed);
  return {
    private: Buffer.from(priv),
    public:  Buffer.from(pub),
    keyType: 'curve25519',
  };
}

/**
 * Generate a signed pre-key.
 * @param {{ private: Buffer, public: Buffer }} identityKey
 * @param {number} keyId
 */
function generateSignedPreKey(identityKey, keyId) {
  const keyPair = generateCurve25519KeyPair();
  // Signature is HMAC-SHA256 of public key signed with identity private key (stub)
  const signature = crypto
    .createHmac('sha256', identityKey.private)
    .update(keyPair.public)
    .digest();

  return {
    keyPair,
    signature,
    keyId,
  };
}

/**
 * Generate a batch of pre-keys.
 * @param {number} startId
 * @param {number} count
 */
function generatePreKeys(startId, count) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({
      keyId:   startId + i,
      keyPair: generateCurve25519KeyPair(),
    });
  }
  return keys;
}

module.exports = {
  generateRegistrationNode,
  generateCurve25519KeyPair,
  generateSignedPreKey,
  generatePreKeys,
};
