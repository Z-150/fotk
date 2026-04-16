'use strict';

const crypto = require('crypto');

// WA protocol header: 'WA' + version [6, 5]
const WA_NOISE_WA_HEADER = Buffer.from([0x57, 0x41, 0x06, 0x05]);

// ─────────────────────────────────────────────────────────────────────────────
//  MINIMAL PROTOBUF HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function encodeVarint(value) {
  const out = [];
  let v = value >>> 0;
  while (v > 0x7f) { out.push((v & 0x7f) | 0x80); v >>>= 7; }
  out.push(v & 0x7f);
  return Buffer.from(out);
}

/** Encode proto field: wire type 2 (length-delimited) */
function protoBytes(fieldNum, data) {
  const tag = (fieldNum << 3) | 2;
  return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
}

/**
 * Encode WA HandshakeMessage { clientHello: { ephemeral: bytes } }
 * Field layout (reverse-engineered):
 *   HandshakeMessage.field1 = ClientHello
 *   ClientHello.field1      = ephemeral public key bytes
 */
function encodeClientHello(ephemeralPublicKey) {
  const inner = protoBytes(1, ephemeralPublicKey); // ClientHello { ephemeral }
  return protoBytes(1, inner);                      // HandshakeMessage { clientHello }
}

/** Encode a post-handshake data frame: [metric:1][len:3 BE][payload] */
function encodeWAFrame(data) {
  const frame = Buffer.alloc(4 + data.length);
  frame[0] = 0; // metric byte (ignored by server)
  frame.writeUIntBE(data.length, 1, 3);
  data.copy(frame, 4);
  return frame;
}

/** Parse one or more WA frames from a raw buffer. Returns array of payloads. */
function decodeWAFrames(buf) {
  const frames = [];
  let offset   = 0;
  while (offset + 4 <= buf.length) {
    const len = buf.readUIntBE(offset + 1, 3);
    if (offset + 4 + len > buf.length) break; // incomplete frame — wait for more data
    frames.push(buf.slice(offset + 4, offset + 4 + len));
    offset += 4 + len;
  }
  return frames;
}

// ─────────────────────────────────────────────────────────────────────────────
//  NOISE STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────

class WANoiseSocket {
  /**
   * @param {import('ws')} ws
   * @param {{ private: Buffer, public: Buffer }} noiseKey     Static Noise key
   * @param {{ private: Buffer, public: Buffer }} ephemeralKey Session ephemeral key
   */
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

  /** Send ClientHello — first message after WS open. */
  async performHandshake() {
    const proto = encodeClientHello(this.ephemeralKey.public);
    this._sendRaw(Buffer.concat([WA_NOISE_WA_HEADER, proto]));
  }

  _sendRaw(data) { this.ws.send(data); }

  /** Send an AES-256-GCM encrypted frame. */
  sendEncrypted(plaintext) {
    if (!this.isHandshakeDone || !this._sendKey) throw new Error('Handshake not complete');
    const iv         = this._buildIV(this.sendCount++);
    const ciphertext = this._gcmEncrypt(this._sendKey, iv, plaintext);
    this._sendRaw(encodeWAFrame(ciphertext));
  }

  /** Decrypt an incoming frame payload. Returns plaintext. */
  decryptFramePayload(payload) {
    if (!this.isHandshakeDone || !this._recvKey) return payload;
    const iv = this._buildIV(this.recvCount++);
    return this._gcmDecrypt(this._recvKey, iv, payload);
  }

  _gcmEncrypt(key, iv, pt) {
    const c   = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = c.update(pt);
    c.final();
    return Buffer.concat([enc, c.getAuthTag()]);
  }

  _gcmDecrypt(key, iv, ct) {
    const tag = ct.slice(-16);
    const dat = ct.slice(0, -16);
    const d   = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dat), d.final()]);
  }

  _buildIV(count) {
    const iv = Buffer.alloc(12, 0);
    iv.writeUInt32BE(count, 8);
    return iv;
  }

  /** HKDF-SHA256 */
  static hkdf(inputKey, salt, info, length = 64) {
    const prk = crypto.createHmac('sha256', salt).update(inputKey).digest();
    const n   = Math.ceil(length / 32);
    const okm = [];
    let t     = Buffer.alloc(0);
    for (let i = 1; i <= n; i++) {
      t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest();
      okm.push(t);
    }
    return Buffer.concat(okm).slice(0, length);
  }

  /** Finalise handshake — derives send/recv AES keys from DH shared secret. */
  finaliseHandshake(sharedSecret) {
    const derived    = WANoiseSocket.hkdf(sharedSecret, Buffer.alloc(32), Buffer.from('WhatsApp Noise Keys'));
    this._sendKey    = derived.slice(0, 32);
    this._recvKey    = derived.slice(32, 64);
    this.isHandshakeDone = true;
  }
}

module.exports = { WANoiseSocket, WA_NOISE_WA_HEADER, encodeClientHello, encodeWAFrame, decodeWAFrames, protoBytes };
