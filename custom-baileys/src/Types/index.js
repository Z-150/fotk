'use strict';

const DisconnectReason = Object.freeze({
  connectionClosed: 428, connectionLost: 408, connectionReplaced: 440,
  timedOut: 408, loggedOut: 401, badSession: 500, restartRequired: 515, multideviceMismatch: 411,
});

const MessageType = Object.freeze({
  text: 'conversation', extendedText: 'extendedTextMessage',
  image: 'imageMessage', video: 'videoMessage', audio: 'audioMessage',
  sticker: 'stickerMessage', document: 'documentMessage', location: 'locationMessage',
  contact: 'contactMessage', buttons: 'buttonsMessage', buttonReply: 'buttonsResponseMessage',
  list: 'listMessage', listReply: 'listResponseMessage', template: 'templateMessage',
  templateReply: 'templateButtonReplyMessage', reaction: 'reactionMessage',
  viewOnce: 'viewOnceMessage', interactive: 'interactiveMessage',
  interactiveReply: 'interactiveResponseMessage', product: 'productMessage',
  requestPayment: 'requestPaymentMessage', poll: 'pollCreationMessage',
  pollUpdate: 'pollUpdateMessage',
  groupStatusV2: 'groupStatusV2BroadcastLinkedGroupMessage',
  album: 'albumMessage', event: 'eventMessage',
});

const MediaType = Object.freeze({
  image: 'image', video: 'video', audio: 'audio',
  document: 'document', sticker: 'sticker', thumbnail: 'thumbnail',
});

const InteractiveButtonType = Object.freeze({
  COPY: 'cta_copy', URL: 'cta_url', CALL: 'cta_call',
  REMINDER: 'cta_reminder', CANCEL_REMINDER: 'cta_cancel_reminder',
  ADDRESS: 'address_message', SEND_LOCATION: 'send_location',
  SINGLE_SELECT: 'single_select', QUICK_REPLY: 'quick_reply', BOTTOM_SHEET: 'bottom_sheet',
});

const InteractiveHeaderType = Object.freeze({ UNKNOWN: 0, TEXT: 1, VIDEO: 2, IMAGE: 3, DOCUMENT: 4 });
const EventJoinStatus = Object.freeze({ UNKNOWN: 0, APPROVED: 1, PENDING: 2, DECLINED: 3 });
const CurrencyCode = Object.freeze({ IDR: 'IDR', USD: 'USD', EUR: 'EUR', SGD: 'SGD', MYR: 'MYR', INR: 'INR' });
const WA_DEFAULT_EPHEMERAL = 7 * 24 * 60 * 60;
const PHONENUMBER_MCC = { '62': 'ID', '1': 'US', '44': 'GB', '91': 'IN', '86': 'CN', '81': 'JP' };

function jidNormalizedUser(n) { return `${n.replace(/[^0-9]/g, '')}@s.whatsapp.net`; }
function jidGroup(id) { return id.includes('@') ? id : `${id}@g.us`; }
function jidNewsletter(id) { return id.includes('@') ? id : `${id}@newsletter`; }
function jidDecode(jid) {
  if (!jid) return null;
  const [userPart, server] = jid.split('@');
  if (!server) return null;
  const [user, deviceStr] = userPart.split(':');
  return { user, server, device: deviceStr ? parseInt(deviceStr, 10) : undefined };
}
function areJidsSameUser(j1, j2) { return jidDecode(j1)?.user === jidDecode(j2)?.user; }
function isJidGroup(jid)      { return jid?.endsWith('@g.us'); }
function isJidUser(jid)       { return jid?.endsWith('@s.whatsapp.net'); }
function isJidBroadcast(jid)  { return jid?.endsWith('@broadcast'); }
function isJidNewsletter(jid) { return jid?.endsWith('@newsletter'); }
function makeWAMessage(fields = {}) {
  return {
    key: { remoteJid: '', fromMe: false, id: '', participant: undefined, ...fields.key },
    message: fields.message || null, messageTimestamp: fields.messageTimestamp || Math.floor(Date.now() / 1000),
    status: fields.status || 0, pushName: fields.pushName || '', broadcast: fields.broadcast || false, ...fields,
  };
}

module.exports = {
  DisconnectReason, MessageType, MediaType, InteractiveButtonType, InteractiveHeaderType,
  EventJoinStatus, CurrencyCode, WA_DEFAULT_EPHEMERAL, PHONENUMBER_MCC,
  jidNormalizedUser, jidGroup, jidNewsletter, jidDecode, areJidsSameUser,
  isJidGroup, isJidUser, isJidBroadcast, isJidNewsletter, makeWAMessage,
};
