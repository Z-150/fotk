'use strict';

const crypto = require('crypto');
const { randomBytes } = require('../Utils');

/**
 * generateRegistrationNode
 * Produces fresh credentials for a new WA MD session.
 */
function generateRegistrationNode() {
  const noiseKey          = generateCurve25519KeyPair();
  const signedIdentityKey = generateCurve25519KeyPair();
  const registrationId    = (crypto.randomBytes(2).readUInt16BE(0) & 0x3fff) + 1;

  return {
    noiseKey,
    signedIdentityKey,
    signedPreKey:               generateSignedPreKey(signedIdentityKey, 1),
    registrationId,
    advSecretKey:               randomBytes(32).toString('base64'),
    processedHistoryMessages:   [],
    nextPreKeyId:               1,
    firstUnuploadedPreKeyId:    1,
    serverHasPreKeys:           false,
    account:                    undefined,
    me:                         undefined,
    signalIdentities:           [],
    myAppStateKeyId:            undefined,
    firstAppStateSyncKeyUpdate: undefined,
    lastAppStateStats:          undefined,
    lastAccountSyncTimestamp:   undefined,
    platform:                   'smba',
    routingInfo:                undefined,
    pairingCode:                undefined,
  };
}

function generateCurve25519KeyPair() {
  let curve;
  try { curve = require('curve25519-js'); } catch { /* fallback below */ }

  if (curve) {
    const seed = crypto.randomBytes(32);
    const { private: priv, public: pub } = curve.generateKeyPair(seed);
    return { private: Buffer.from(priv), public: Buffer.from(pub), keyType: 'curve25519' };
  }

  // Structural fallback — replace with real Curve25519 for production auth
  return { private: crypto.randomBytes(32), public: crypto.randomBytes(32), keyType: 'curve25519' };
}

function generateSignedPreKey(identityKey, keyId) {
  const keyPair   = generateCurve25519KeyPair();
  const signature = crypto.createHmac('sha256', identityKey.private).update(keyPair.public).digest();
  return { keyPair, signature, keyId };
}

function generatePreKeys(startId, count) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({ keyId: startId + i, keyPair: generateCurve25519KeyPair() });
  }
  return keys;
}

module.exports = { generateRegistrationNode, generateCurve25519KeyPair, generateSignedPreKey, generatePreKeys };
