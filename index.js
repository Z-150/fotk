'use strict';

/**
 * Fotk — Custom WhatsApp Multi-Device Bot Library
 * ═════════════════════════════════════════════════
 * Drop-in compatible with WhatsApp MD event API.
 *
 * Quick start:
 *   const { makeWASocket, useMultiFileAuthState } = require('fotk');
 *   const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
 *   const sock = makeWASocket({ auth: state, saveCreds, printQRInTerminal: true });
 */

const { WASocket, makeWASocket, fetchLatestWaWebVersion, getWaWebVersion, Browsers } = require('./src/Socket');
const { useMultiFileAuthState, generateRegistrationNode, generatePreKeys }            = require('./src/Auth');
const { resolveMedia, computeMediaHashes, guessMimeType, mediaTypeFromMime,
        downloadMediaMessage, saveMedia }                                             = require('./src/Message/media');
const { buildTextMessage, buildImageMessage, buildVideoMessage, buildAudioMessage,
        buildDocumentMessage, buildStickerMessage, buildButtonMessage, buildListMessage,
        buildTemplateMessage, buildReactionMessage, buildLocationMessage,
        buildMessageEnvelope, buildContextInfo }                                      = require('./src/Message/builder');
const { DisconnectReason, MessageType, MediaType, WA_DEFAULT_EPHEMERAL,
        jidNormalizedUser, jidGroup, jidDecode, areJidsSameUser,
        isJidGroup, isJidUser, isJidBroadcast, makeWAMessage }                       = require('./src/Types');
const { generateMessageID, generateUUID, sleep, unixTimestampSeconds,
        normalizePhoneNumber }                                                        = require('./src/Utils');

module.exports = {
  // ── Core ────────────────────────────────────────────────────────────────────
  WASocket,
  makeWASocket,
  fetchLatestWaWebVersion,
  getWaWebVersion,
  Browsers,

  // ── Auth ────────────────────────────────────────────────────────────────────
  useMultiFileAuthState,
  generateRegistrationNode,
  generatePreKeys,

  // ── Message builders ────────────────────────────────────────────────────────
  buildTextMessage,
  buildImageMessage,
  buildVideoMessage,
  buildAudioMessage,
  buildDocumentMessage,
  buildStickerMessage,
  buildButtonMessage,       // ★ patched
  buildListMessage,         // ★ patched
  buildTemplateMessage,     // ★ patched
  buildReactionMessage,
  buildLocationMessage,
  buildMessageEnvelope,
  buildContextInfo,

  // ── Media helpers ────────────────────────────────────────────────────────────
  resolveMedia,
  computeMediaHashes,
  guessMimeType,
  mediaTypeFromMime,
  downloadMediaMessage,
  saveMedia,

  // ── Types & constants ────────────────────────────────────────────────────────
  DisconnectReason,
  MessageType,
  MediaType,
  WA_DEFAULT_EPHEMERAL,

  // ── JID helpers ──────────────────────────────────────────────────────────────
  jidNormalizedUser,
  jidGroup,
  jidDecode,
  areJidsSameUser,
  isJidGroup,
  isJidUser,
  isJidBroadcast,
  makeWAMessage,

  // ── Utils ────────────────────────────────────────────────────────────────────
  generateMessageID,
  generateUUID,
  sleep,
  unixTimestampSeconds,
  normalizePhoneNumber,
};
