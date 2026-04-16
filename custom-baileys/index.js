'use strict';

/**
 * custom-baileys v2.0
 * ───────────────────
 * WhatsApp Multi-Device Bot Library
 *
 * New in v2:
 *   sock.newsletterId(url)      — resolve Channel/Newsletter JID
 *   sock.checkWhatsApp(jid)     — verify if number is on WA
 *   sendMessage: groupStatusMessage, albumMessage, eventMessage,
 *                pollResultMessage, interactiveMessage, productMessage,
 *                requestPaymentMessage
 */

// ── Core ──────────────────────────────────────────────────────────────────────
const { WASocket, makeWASocket }               = require('./src/Socket');

// ── Auth ──────────────────────────────────────────────────────────────────────
const { useMultiFileAuthState, generateRegistrationNode, generatePreKeys } = require('./src/Auth');

// ── Message builders ──────────────────────────────────────────────────────────
const {
  buildTextMessage, buildImageMessage, buildVideoMessage,
  buildAudioMessage, buildDocumentMessage, buildStickerMessage,
  buildButtonMessage, buildListMessage, buildTemplateMessage,
  buildReactionMessage, buildLocationMessage, buildMessageEnvelope, buildContextInfo,
  // ★ v2
  buildGroupStatusV2Message,
  buildAlbumMessage,
  buildEventMessage,
  buildPollResultMessage,
  buildInteractiveMessage,
  buildInteractiveWithDocBuffer,
  buildProductMessage,
  buildRequestPaymentMessage,
} = require('./src/Message/builder');

const {
  resolveMedia, computeMediaHashes, guessMimeType,
  mediaTypeFromMime, downloadMediaMessage, saveMedia,
} = require('./src/Message/media');

// ── Types ─────────────────────────────────────────────────────────────────────
const {
  DisconnectReason, MessageType, MediaType,
  InteractiveButtonType, InteractiveHeaderType,
  EventJoinStatus, CurrencyCode,
  WA_DEFAULT_EPHEMERAL, PHONENUMBER_MCC,
  jidNormalizedUser, jidGroup, jidNewsletter, jidDecode,
  areJidsSameUser, isJidGroup, isJidUser, isJidBroadcast, isJidNewsletter,
  makeWAMessage,
} = require('./src/Types');

// ── Utils ─────────────────────────────────────────────────────────────────────
const {
  generateMessageID, generateUUID, sleep, backoff,
  unixTimestampSeconds, normalizePhoneNumber,
} = require('./src/Utils');

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  // Core
  WASocket,
  makeWASocket,

  // Auth
  useMultiFileAuthState,
  generateRegistrationNode,
  generatePreKeys,

  // Standard builders
  buildTextMessage,
  buildImageMessage,
  buildVideoMessage,
  buildAudioMessage,
  buildDocumentMessage,
  buildStickerMessage,
  buildButtonMessage,
  buildListMessage,
  buildTemplateMessage,
  buildReactionMessage,
  buildLocationMessage,
  buildMessageEnvelope,
  buildContextInfo,

  // ★ v2 builders
  buildGroupStatusV2Message,
  buildAlbumMessage,
  buildEventMessage,
  buildPollResultMessage,
  buildInteractiveMessage,
  buildInteractiveWithDocBuffer,
  buildProductMessage,
  buildRequestPaymentMessage,

  // Media helpers
  resolveMedia,
  computeMediaHashes,
  guessMimeType,
  mediaTypeFromMime,
  downloadMediaMessage,
  saveMedia,

  // Types & constants
  DisconnectReason, MessageType, MediaType,
  InteractiveButtonType, InteractiveHeaderType,
  EventJoinStatus, CurrencyCode,
  WA_DEFAULT_EPHEMERAL, PHONENUMBER_MCC,

  // JID helpers
  jidNormalizedUser, jidGroup, jidNewsletter, jidDecode,
  areJidsSameUser, isJidGroup, isJidUser, isJidBroadcast, isJidNewsletter,
  makeWAMessage,

  // Utils
  generateMessageID, generateUUID, sleep, backoff,
  unixTimestampSeconds, normalizePhoneNumber,
};
