'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS & ENUMS
// ─────────────────────────────────────────────────────────────────────────────

const DisconnectReason = Object.freeze({
  connectionClosed:    428,
  connectionLost:      408,
  connectionReplaced:  440,
  timedOut:            408,
  loggedOut:           401,
  badSession:          500,
  restartRequired:     515,
  multideviceMismatch: 411,
});

const MessageType = Object.freeze({
  text:            'conversation',
  extendedText:    'extendedTextMessage',
  image:           'imageMessage',
  video:           'videoMessage',
  audio:           'audioMessage',
  sticker:         'stickerMessage',
  document:        'documentMessage',
  location:        'locationMessage',
  contact:         'contactMessage',
  buttons:         'buttonsMessage',
  buttonReply:     'buttonsResponseMessage',
  list:            'listMessage',
  listReply:       'listResponseMessage',
  template:        'templateMessage',
  templateReply:   'templateButtonReplyMessage',
  reaction:        'reactionMessage',
  viewOnce:        'viewOnceMessage',
});

const MediaType = Object.freeze({
  image:    'image',
  video:    'video',
  audio:    'audio',
  document: 'document',
  sticker:  'sticker',
});

const WA_DEFAULT_EPHEMERAL = 7 * 24 * 60 * 60; // 7 days in seconds

// ─────────────────────────────────────────────────────────────────────────────
//  JID HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** '628xxx' → '628xxx@s.whatsapp.net' */
function jidNormalizedUser(number) {
  return `${String(number).replace(/\D/g, '')}@s.whatsapp.net`;
}

/** '120363xxx' → '120363xxx@g.us' */
function jidGroup(id) {
  return id.includes('@') ? id : `${id}@g.us`;
}

/** Parse a JID into { user, server, device? } */
function jidDecode(jid) {
  if (!jid) return null;
  const [userPart, server] = jid.split('@');
  if (!server) return null;
  const [user, deviceStr] = userPart.split(':');
  return { user, server, device: deviceStr !== undefined ? parseInt(deviceStr, 10) : undefined };
}

function areJidsSameUser(j1, j2)  { return jidDecode(j1)?.user === jidDecode(j2)?.user; }
function isJidGroup(jid)           { return typeof jid === 'string' && jid.endsWith('@g.us'); }
function isJidUser(jid)            { return typeof jid === 'string' && jid.endsWith('@s.whatsapp.net'); }
function isJidBroadcast(jid)       { return typeof jid === 'string' && jid.endsWith('@broadcast'); }

// ─────────────────────────────────────────────────────────────────────────────
//  WAMessage FACTORY
// ─────────────────────────────────────────────────────────────────────────────

function makeWAMessage(fields = {}) {
  return {
    key: {
      remoteJid:   '',
      fromMe:      false,
      id:          '',
      participant: undefined,
      ...fields.key,
    },
    message:          fields.message          || null,
    messageTimestamp: fields.messageTimestamp || Math.floor(Date.now() / 1000),
    status:           fields.status           || 0,
    pushName:         fields.pushName         || '',
    broadcast:        fields.broadcast        || false,
    ...fields,
  };
}

module.exports = {
  DisconnectReason,
  MessageType,
  MediaType,
  WA_DEFAULT_EPHEMERAL,
  jidNormalizedUser,
  jidGroup,
  jidDecode,
  areJidsSameUser,
  isJidGroup,
  isJidUser,
  isJidBroadcast,
  makeWAMessage,
};
