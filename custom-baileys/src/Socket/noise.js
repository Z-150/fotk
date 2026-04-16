'use strict';

const crypto = require('crypto');

// ─────────────────────────────────────────────
//  WA NOISE PROTOCOL CONSTANTS
// ─────────────────────────────────────────────

const WA_NOISE_PROTOCOL = 'Noise_XX_25519_AESGCM_SHA256\x00\x00\x00\x00';
// 'WA' + protocol version [6, 5]
const WA_NOISE_WA_HEADER = Buffer.from([0x57, 0x41, 0x06, 0x05]);

// ─────────────────────────────────────────────
//  MINIMAL PROTOBUF HELPERS
// ─────────────────────────────────────────────

function encodeVarint(value) {
  const bytes = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Buffer.from(bytes);
}

function protoBytes(fieldNum, data) {
  const tag = (fieldNum << 3) | 2;
  return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
}

/**
 * Encode HandshakeMessage { clientHello: { ephemeral: bytes } }
 * WA proto: HandshakeMessage.field1 = ClientHello, ClientHello.field1 = ephemeral bytes
 */
function encodeClientHello(ephemeralPublicKey) {
  const inner = protoBytes(1, ephemeralPublicKey); // ClientHello.ephemeral
  return protoBytes(1, inner);                      // HandshakeMessage.clientHello
}

/**
 * Encode a post-handshake WA data frame.
 * Format: [metric:1][length:3 BE][payload:length]
 */
function encodeWAFrame(data) {
  const frame = Buffer.alloc(4 + data.length);
  frame[0] = 0; // metric byte
  frame.writeUIntBE(data.length, 1, 3);
  data.copy(frame, 4);
  return frame;
}

/**
 * Decode WA frames from a raw Buffer. Returns array of payload Buffers.
 */
function decodeWAFrames(buf) {
  const frames = [];
  let offset = 0;
  while (offset + 4 <= buf.length) {
    const length = buf.readUIntBE(offset + 1, 3);
    if (offset + 4 + length > buf.length) break;
    frames.push(buf.slice(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  return frames;
}

// ─────────────────────────────────────────────
//  NOISE STATE MACHINE
// ─────────────────────────────────────────────

class WANoiseSocket {
  constructor(ws, noiseKey, ephemeralKey) {
    this.ws              = ws;
    this.noiseKey        = noiseKey;
    this.ephemeralKey    = ephemeralKey;
    this.isHandshakeDone = false;
    this.sendCount       = 0;
    this.recvCount       = 0;
    this._sendKey        = null;
    this._recvKey        = null;
  }

  /**
   * Send ClientHello — the very first frame after WS open.
   * Format: WA_HEADER(4) + protobuf HandshakeMessage
   */
  async performHandshake() {
    const clientHelloProto = encodeClientHello(this.ephemeralKey.public);
    const frame = Buffer.concat([WA_NOISE_WA_HEADER, clientHelloProto]);
    this._sendRaw(frame);
  }

  _sendRaw(data) {
    this.ws.send(data);
  }

  /** Send encrypted frame after handshake. */
  sendEncrypted(plaintext) {
    if (!this.isHandshakeDone || !this._sendKey) {
      throw new Error('Cannot send — Noise handshake not complete');
    }
    const iv         = this._encodeIV(this.sendCount++);
    const ciphertext = this._aesGcmEncrypt(this._sendKey, iv, plaintext);
    this._sendRaw(encodeWAFrame(ciphertext));
  }

  /** Decrypt incoming frame payload. */
  decryptFramePayload(payload) {
    if (!this.isHandshakeDone || !this._recvKey) return payload;
    const iv = this._encodeIV(this.recvCount++);
    return this._aesGcmDecrypt(this._recvKey, iv, payload);
  }

  _aesGcmEncrypt(key, iv, plaintext) {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc    = cipher.update(plaintext);
    cipher.final();
    return Buffer.concat([enc, cipher.getAuthTag()]);
  }

  _aesGcmDecrypt(key, iv, ciphertext) {
    const tag      = ciphertext.slice(-16);
    const data     = ciphertext.slice(0, -16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  _encodeIV(count) {
    const iv = Buffer.alloc(12, 0);
    iv.writeUInt32BE(count, 8);
    return iv;
  }

  static hkdf(inputKey, salt, info, length = 64) {
    const prk = crypto.createHmac('sha256', salt).update(inputKey).digest();
    const n   = Math.ceil(length / 32);
    const okm = [];
    let t = Buffer.alloc(0);
    for (let i = 1; i <= n; i++) {
      t = crypto.createHmac('sha256', prk)
        .update(Buffer.concat([t, info, Buffer.from([i])]))
        .digest();
      okm.push(t);
    }
    return Buffer.concat(okm).slice(0, length);
  }

  finaliseHandshake(sharedSecret) {
    const derived  = WANoiseSocket.hkdf(sharedSecret, Buffer.alloc(32), Buffer.from('WhatsApp Noise Keys'));
    this._sendKey  = derived.slice(0, 32);
    this._recvKey  = derived.slice(32, 64);
    this.isHandshakeDone = true;
  }
}

module.exports = {
  WANoiseSocket,
  WA_NOISE_WA_HEADER,
  encodeClientHello,
  encodeWAFrame,
  decodeWAFrames,
  protoBytes,
};
