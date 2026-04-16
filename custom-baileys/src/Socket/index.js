'use strict';

const EventEmitter = require('events');
const WebSocket    = require('ws');
const qrcode       = require('qrcode-terminal');

const { WANoiseSocket, WA_NOISE_WA_HEADER, decodeWAFrames } = require('./noise');
const { decodeBinaryNode, encodeBinaryNode } = require('./binary');
const {
  buildGroupIQ, buildGroupMetadataQuery, parseGroupMetadata,
  buildCreateGroupIQ, buildLeaveGroupIQ,
  buildGroupInviteLinkIQ, buildGroupDescriptionIQ,
} = require('./groups');
const {
  generateMessageID, sleep, backoff, unixTimestampSeconds,
} = require('../Utils');
const {
  jidNormalizedUser, jidGroup, jidDecode, isJidGroup, makeWAMessage,
  DisconnectReason,
} = require('../Types');
const {
  buildTextMessage, buildImageMessage, buildVideoMessage, buildAudioMessage,
  buildDocumentMessage, buildStickerMessage,
  buildButtonMessage, buildListMessage, buildTemplateMessage,
  buildReactionMessage, buildLocationMessage, buildMessageEnvelope,
} = require('../Message/builder');
const { resolveMedia, guessMimeType } = require('../Message/media');

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const WA_WS_URL           = 'wss://web.whatsapp.com/ws/chat';
const WA_ORIGIN           = 'https://web.whatsapp.com';
const WA_USER_AGENT       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const MAX_RECONNECTS      = 5;
const KEEPALIVE_INTERVAL  = 25_000;

// ─────────────────────────────────────────────
//  MAIN SOCKET CLASS
// ─────────────────────────────────────────────

class WASocket extends EventEmitter {
  constructor(config = {}) {
    super();

    this.auth                 = config.auth;
    this.saveCreds            = config.saveCreds || (() => {});
    this.logger               = config.logger    || createNullLogger();
    this.printQRInTerminal    = config.printQRInTerminal !== false;
    this.markOnlineOnConnect  = config.markOnlineOnConnect || false;
    this.connectTimeoutMs     = config.connectTimeoutMs || 20_000;
    this.defaultQueryTimeoutMs = config.defaultQueryTimeoutMs || 60_000;

    this._ws             = null;
    this._noiseSocket    = null;
    this._connectAttempt = 0;
    this._connected      = false;
    this._closed         = false;
    this._keepaliveTimer = null;
    this._pendingQueries = new Map();
    this._frameBuffer    = Buffer.alloc(0);
    this._handshakeDone  = false;
  }

  // ─────────────────────────────────────────────
  //  CONNECTION
  // ─────────────────────────────────────────────

  async connect() {
    if (this._closed) return;
    this.logger.info('Connecting to WhatsApp...');
    this.emit('connection.update', { connection: 'connecting' });
    try {
      await this._openWebSocket();
    } catch (err) {
      this.logger.error({ err }, 'Connection failed');
      await this._scheduleReconnect(err);
    }
  }

  async end(reason) {
    this._closed = true;
    this._stopKeepalive();
    if (this._ws) {
      this._ws.removeAllListeners();
      try { this._ws.close(); } catch {}
      this._ws = null;
    }
    this.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: reason || new Error('Closed'), date: new Date() },
    });
  }

  // ─────────────────────────────────────────────
  //  INTERNAL — WS SETUP
  // ─────────────────────────────────────────────

  _openWebSocket() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WA_WS_URL, {
        origin:  WA_ORIGIN,
        headers: { 'User-Agent': WA_USER_AGENT },
        handshakeTimeout: this.connectTimeoutMs,
      });

      this._ws          = ws;
      this._frameBuffer = Buffer.alloc(0);
      this._handshakeDone = false;

      const { generateCurve25519KeyPair } = require('../Auth/registration');
      const ephemeralKey = generateCurve25519KeyPair();
      this._noiseSocket  = new WANoiseSocket(ws, this.auth.creds.noiseKey, ephemeralKey);

      const timer = setTimeout(() => {
        reject(new Error('WS connect timeout'));
        ws.terminate();
      }, this.connectTimeoutMs);

      ws.on('open', async () => {
        clearTimeout(timer);
        this.logger.info('WebSocket open — sending ClientHello');
        try {
          await this._noiseSocket.performHandshake();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      ws.on('message', (data) => this._onMessage(data));
      ws.on('close',   (code, reason) => this._onClose(code, reason));
      ws.on('error',   (err) => this.logger.error({ err }, 'WebSocket error'));
    });
  }

  // ─────────────────────────────────────────────
  //  INTERNAL — MESSAGE HANDLER
  // ─────────────────────────────────────────────

  _onMessage(rawData) {
    const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);

    if (!this._handshakeDone) {
      // The server's first message IS the ServerHello — it is NOT framed
      // with our [metric+len] format; it comes as a raw WS message.
      this._processServerHello(data);
      return;
    }

    // Post-handshake: server uses the same [metric:1][len:3][payload] framing.
    // Accumulate in case of fragmentation.
    this._frameBuffer = Buffer.concat([this._frameBuffer, data]);
    const frames = decodeWAFrames(this._frameBuffer);
    // Recalculate remaining bytes (everything after last complete frame)
    let consumed = 0;
    for (const frame of frames) {
      consumed += 4 + frame.length; // 4 = metric+len header
    }
    this._frameBuffer = this._frameBuffer.slice(consumed);

    for (const payload of frames) {
      try {
        const decrypted = this._noiseSocket.decryptFramePayload(payload);
        this._dispatchStanza(decrypted);
      } catch (err) {
        this.logger.error({ err }, 'Error decrypting/dispatching frame');
      }
    }
  }

  /**
   * Process the ServerHello protobuf frame.
   *
   * WA ServerHello proto (field numbers from reverse engineering):
   *   HandshakeMessage.serverHello (field 2) {
   *     ephemeral (field 1): bytes  ← server ephemeral public key
   *     static   (field 2): bytes  ← encrypted server static key
   *     payload  (field 3): bytes  ← encrypted certificate payload
   *   }
   *
   * Full Noise_XX DH: not implemented in stub — we read the ephemeral key
   * and complete the session in a simplified way.
   */
  _processServerHello(data) {
    this.logger.info(`ServerHello received (${data.length} bytes) — completing handshake`);

    // In a full implementation:
    //   1. Parse serverHello.ephemeral (32 bytes) from protobuf
    //   2. DH(client_ephemeral_priv, server_ephemeral_pub) → sharedSecret1
    //   3. MixHash, EncryptAndHash(serverHello.static), MixHash(serverHello.payload)
    //   4. DH(client_static_priv, server_ephemeral_pub) → sharedSecret2
    //   5. Derive final send/recv keys
    //   6. Send ClientFinish (encrypted client static key + encrypted payload)
    //
    // Stub: derive keys from random shared secret (QR is non-scannable in this mode).

    const fakeSharedSecret = require('crypto').randomBytes(32);
    this._noiseSocket.finaliseHandshake(fakeSharedSecret);
    this._handshakeDone = true;

    this._connected      = true;
    this._connectAttempt = 0;
    this._startKeepalive();

    // Send ClientFinish
    this._sendClientFinish();

    if (!this.auth.creds.me) {
      this._requestQR();
    } else {
      this._restoreSession();
    }
  }

  _sendClientFinish() {
    // ClientFinish contains the encrypted client static key + encrypted payload.
    // Stub: send empty encrypted frame.
    try {
      this._noiseSocket.sendEncrypted(Buffer.from(JSON.stringify({
        clientFinish: true,
        registrationId: this.auth.creds.registrationId,
        platform: 'WEB',
      })));
    } catch (err) {
      this.logger.error({ err }, 'Error sending ClientFinish');
    }
  }

  _requestQR() {
    // Build a displayable QR string from our public keys.
    // In production the server provides a `ref` token that goes here.
    const qrStr = [
      Buffer.from(this.auth.creds.noiseKey.public).toString('base64'),
      Buffer.from(this.auth.creds.signedIdentityKey.public).toString('base64'),
      Buffer.from(this.auth.creds.advSecretKey, 'base64').toString('base64'),
      'REF_PLACEHOLDER',
    ].join(',');

    this.logger.info('Requesting QR...');
    if (this.printQRInTerminal) {
      console.log('\n📱 Scan QR code ini dengan WhatsApp kamu:\n');
      qrcode.generate(qrStr, { small: true });
    }
    this.emit('connection.update', { qr: qrStr, connection: 'connecting' });
  }

  _restoreSession() {
    this.logger.info(`Restoring session for ${this.auth.creds.me?.id}`);
    this.emit('connection.update', { connection: 'open', isNewLogin: false });
    if (this.markOnlineOnConnect) this.sendPresenceUpdate('available');
  }

  // ─────────────────────────────────────────────
  //  INTERNAL — STANZA DISPATCHER
  // ─────────────────────────────────────────────

  _dispatchStanza(data) {
    let node;
    try {
      node = decodeBinaryNode(data);
    } catch {
      return; // Not a binary stanza (e.g. protobuf media frame)
    }
    if (!node) return;

    const [tag] = node;
    switch (tag) {
      case 'iq':           this._handleIQ(node);           break;
      case 'message':      this._handleMessage(node);      break;
      case 'receipt':      this._handleReceipt(node);      break;
      case 'presence':     this._handlePresence(node);     break;
      case 'notification': this._handleNotification(node); break;
      case 'success':      this._handleSuccess(node);      break;
      case 'failure':      this._handleFailure(node);      break;
      default:
        this.logger.debug({ tag }, 'Unhandled stanza');
    }
  }

  _handleIQ(node) {
    const [, attrs] = node;
    const id = attrs?.id;
    if (id && this._pendingQueries.has(id)) {
      const { resolve, timer } = this._pendingQueries.get(id);
      clearTimeout(timer);
      this._pendingQueries.delete(id);
      resolve(node);
    }
  }

  _handleMessage(node) {
    const [, attrs, content] = node;
    const msg = makeWAMessage({
      key: {
        remoteJid:   attrs?.from,
        fromMe:      false,
        id:          attrs?.id,
        participant: attrs?.participant,
      },
      message:          this._parseMessageContent(content),
      messageTimestamp: parseInt(attrs?.t || '0', 10),
      pushName:         attrs?.notify || '',
    });
    this.emit('messages.upsert', { messages: [msg], type: 'notify' });
    this._sendReceipt(attrs?.from, attrs?.id, 'delivery', attrs?.participant);
  }

  _parseMessageContent(content) {
    if (!Array.isArray(content)) return null;
    return { conversation: '[encrypted — Signal decryption not implemented in stub]' };
  }

  _handleReceipt(node) {
    const [, attrs] = node;
    this.emit('message-receipt.update', [{
      key: { remoteJid: attrs?.from, id: attrs?.id, fromMe: !!attrs?.recipient },
      update: { status: attrs?.type === 'read' ? 4 : 3 },
    }]);
  }

  _handlePresence(node) {
    const [, attrs] = node;
    this.emit('presence.update', {
      id: attrs?.from,
      presences: {
        [attrs?.from]: {
          lastKnownPresence: attrs?.type || 'available',
          lastSeen: attrs?.last ? parseInt(attrs.last, 10) : undefined,
        },
      },
    });
  }

  _handleNotification(node) {
    const [, attrs, children] = node;
    const from = attrs?.from;
    if (isJidGroup(from) && Array.isArray(children)) {
      const action = children[0]?.[0];
      const participants = (Array.isArray(children[0]?.[2]) ? children[0][2] : [])
        .map((n) => n?.[1]?.jid).filter(Boolean);
      if (action) this.emit('group-participants.update', { id: from, participants, action });
    }
  }

  _handleSuccess(node) {
    const [, attrs] = node;
    this.auth.creds.account = attrs;
    this.auth.creds.me      = { id: attrs?.jid, name: attrs?.pushname };
    this.emit('creds.update');
    this.saveCreds();
    this.emit('connection.update', { connection: 'open', isNewLogin: true });
  }

  _handleFailure(node) {
    const [, attrs] = node;
    const reason = parseInt(attrs?.reason || '503', 10);
    this.logger.error({ reason }, 'Login failure');
    const err = new Error(`Login failure: ${reason}`);
    err.output = { statusCode: reason };
    this.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: err, date: new Date() },
    });
  }

  // ─────────────────────────────────────────────
  //  INTERNAL — KEEPALIVE
  // ─────────────────────────────────────────────

  _startKeepalive() {
    this._stopKeepalive();
    this._keepaliveTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN && this._handshakeDone) {
        try {
          const ping = encodeBinaryNode([
            'iq',
            { id: generateMessageID(), xmlns: 'w:p', type: 'get', to: 's.whatsapp.net' },
            [['ping', {}, null]],
          ]);
          this._noiseSocket.sendEncrypted(ping);
        } catch {}
      }
    }, KEEPALIVE_INTERVAL);
  }

  _stopKeepalive() {
    if (this._keepaliveTimer) {
      clearInterval(this._keepaliveTimer);
      this._keepaliveTimer = null;
    }
  }

  // ─────────────────────────────────────────────
  //  INTERNAL — SEND HELPERS
  // ─────────────────────────────────────────────

  _sendNode(buf) {
    if (!this._handshakeDone || !this._noiseSocket?.isHandshakeDone) return;
    try {
      this._noiseSocket.sendEncrypted(buf);
    } catch (err) {
      this.logger.error({ err }, 'Error sending node');
    }
  }

  _query(node, timeoutMs) {
    const ms = timeoutMs || this.defaultQueryTimeoutMs;
    return new Promise((resolve, reject) => {
      const msgId = node[1]?.id || generateMessageID();
      if (!node[1]) node[1] = {};
      node[1].id = msgId;

      const timer = setTimeout(() => {
        this._pendingQueries.delete(msgId);
        reject(new Error(`Query timeout: ${msgId}`));
      }, ms);

      this._pendingQueries.set(msgId, { resolve, reject, timer });
      this._sendNode(encodeBinaryNode(node));
    });
  }

  _sendReceipt(jid, msgId, type = 'delivery', participant) {
    if (!jid || !msgId) return;
    const attrs = { id: msgId, to: jid, type };
    if (participant) attrs.participant = participant;
    this._sendNode(encodeBinaryNode(['receipt', attrs, null]));
  }

  // ─────────────────────────────────────────────
  //  INTERNAL — DISCONNECT / RECONNECT
  // ─────────────────────────────────────────────

  _onClose(code, reason) {
    this._connected     = false;
    this._handshakeDone = false;
    this._stopKeepalive();
    this.logger.warn({ code, reason: reason?.toString() || '' }, 'WebSocket closed');

    if (!this._closed) {
      const err = new Error(`WebSocket closed: ${code}`);
      this.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: err, date: new Date() },
      });
      this._scheduleReconnect(err);
    }
  }

  async _scheduleReconnect(error) {
    if (this._closed) return;

    if (this._connectAttempt >= MAX_RECONNECTS) {
      this.logger.error('Max reconnect attempts reached.');
      const err = Object.assign(error || new Error('Max reconnects'), {
        output: { statusCode: DisconnectReason.connectionLost },
      });
      this.emit('connection.update', {
        connection: 'close',
        lastDisconnect: { error: err, date: new Date() },
      });
      return;
    }

    const delay = backoff(this._connectAttempt);
    this._connectAttempt++;
    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this._connectAttempt}/${MAX_RECONNECTS})...`);
    await sleep(delay);
    if (!this._closed) this._openWebSocket().catch((err) => this._scheduleReconnect(err));
  }

  // ─────────────────────────────────────────────
  //  PUBLIC — SEND MESSAGES
  // ─────────────────────────────────────────────

  async sendMessage(jid, content, options = {}) {
    let messageContent;

    if (content.text !== undefined) {
      messageContent = buildTextMessage(content.text, options);
    } else if (content.image) {
      const buf  = await resolveMedia(content.image);
      messageContent = buildImageMessage(buf, { ...content, ...options });
    } else if (content.video) {
      const buf  = await resolveMedia(content.video);
      messageContent = buildVideoMessage(buf, { ...content, ...options });
    } else if (content.audio) {
      const buf  = await resolveMedia(content.audio);
      messageContent = buildAudioMessage(buf, { ...content, ...options });
    } else if (content.document) {
      const buf  = await resolveMedia(content.document);
      messageContent = buildDocumentMessage(buf, { ...content, ...options });
    } else if (content.sticker) {
      const buf  = await resolveMedia(content.sticker);
      messageContent = buildStickerMessage(buf, { ...content, ...options });
    } else if (content.buttons) {
      messageContent = buildButtonMessage(content, options);       // ★
    } else if (content.sections) {
      messageContent = buildListMessage(content, options);         // ★
    } else if (content.templateButtons) {
      messageContent = buildTemplateMessage({
        text:    content.text    || '',
        footer:  content.footer  || '',
        header:  content.header  || '',
        buttons: content.templateButtons,
      }, options);                                                  // ★
    } else if (content.react) {
      messageContent = buildReactionMessage(content.react.key, content.react.text);
    } else if (content.location) {
      messageContent = buildLocationMessage(
        content.location.degreesLatitude,
        content.location.degreesLongitude,
        { ...content.location, ...options },
      );
    } else {
      messageContent = content;
    }

    const envelope = buildMessageEnvelope(jid, messageContent, {
      ...options,
      pushName: this.auth.creds.me?.name || '',
    });

    const msgNode = this._buildMessageNode(jid, envelope);
    this._sendNode(encodeBinaryNode(msgNode));

    this.emit('messages.upsert', { messages: [envelope], type: 'append' });
    return envelope;
  }

  _buildMessageNode(jid, envelope) {
    const attrs = {
      id:   envelope.key.id,
      to:   jid,
      type: 'text',
      t:    envelope.messageTimestamp.toString(),
    };
    if (isJidGroup(jid) && envelope.key.participant) {
      attrs.participant = envelope.key.participant;
    }
    const encContent = JSON.stringify(envelope.message);
    return ['message', attrs, [['enc', { v: '2', type: 'skmsg' }, Buffer.from(encContent)]]];
  }

  // ─────────────────────────────────────────────
  //  PUBLIC — UTILITY
  // ─────────────────────────────────────────────

  sendPresenceUpdate(type, toJid) {
    const attrs = { type };
    if (toJid) attrs.to = toJid;
    this._sendNode(encodeBinaryNode(['presence', attrs, null]));
  }

  async readMessages(keys) {
    for (const key of keys) {
      this._sendReceipt(key.remoteJid, key.id, 'read', key.participant);
    }
  }

  // ─────────────────────────────────────────────
  //  PUBLIC — GROUP MANAGEMENT
  // ─────────────────────────────────────────────

  async groupMetadata(jid) {
    const result = await this._query(buildGroupMetadataQuery(jid));
    return parseGroupMetadata(result);
  }

  async groupCreate(subject, participants) {
    return this._query(buildCreateGroupIQ(subject, participants));
  }

  async groupLeave(jids) {
    return this._query(buildLeaveGroupIQ(Array.isArray(jids) ? jids : [jids]));
  }

  async groupParticipantsUpdate(jid, participants, action) {
    return this._query(buildGroupIQ(action, jid, participants));
  }

  async groupInviteCode(jid) {
    const result = await this._query(buildGroupInviteLinkIQ(jid));
    return result?.[2]?.[0]?.[1]?.code || null;
  }

  async groupUpdateDescription(jid, description) {
    return this._query(buildGroupDescriptionIQ(jid, description));
  }

  async groupUpdateSubject(jid, subject) {
    return this._query(['iq',
      { id: generateMessageID(), type: 'set', xmlns: 'w:g2', to: jid },
      [['subject', {}, subject]]]);
  }

  async profilePictureUrl(jid, type = 'image') {
    try {
      const result = await this._query(['iq',
        { id: generateMessageID(), type: 'get', xmlns: 'w:profile:picture', to: jid },
        [['picture', { type, query: 'url' }, null]]]);
      return result?.[2]?.[0]?.[1]?.url || null;
    } catch { return null; }
  }

  async fetchStatus(jid) {
    try {
      const result = await this._query(['iq',
        { id: generateMessageID(), type: 'get', xmlns: 'status', to: 's.whatsapp.net' },
        [['status', { jid }, null]]]);
      return { status: result?.[2]?.[0]?.[2] || null };
    } catch { return { status: null }; }
  }
}

// ─────────────────────────────────────────────
//  NULL LOGGER
// ─────────────────────────────────────────────

function createNullLogger() {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop, debug: noop, trace: noop };
}

// ─────────────────────────────────────────────
//  FACTORY
// ─────────────────────────────────────────────

function makeWASocket(config) {
  const sock = new WASocket(config);
  sock.on('creds.update', () => sock.saveCreds());
  sock.connect();
  return sock;
}

module.exports = { WASocket, makeWASocket };
