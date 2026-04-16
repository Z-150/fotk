'use strict';

const { generateMessageID, unixTimestampSeconds } = require('../Utils');
const { isJidGroup } = require('../Types');

// ─────────────────────────────────────────────────────────────────────────────
//  ENVELOPE
// ─────────────────────────────────────────────────────────────────────────────

function buildMessageEnvelope(jid, message, options = {}) {
  return {
    key: {
      remoteJid:   jid,
      fromMe:      true,
      id:          options.messageId || generateMessageID(),
      participant: isJidGroup(jid) ? options.participant : undefined,
    },
    message,
    messageTimestamp: unixTimestampSeconds(),
    status:           1,
    pushName:         options.pushName || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONTEXT INFO
// ─────────────────────────────────────────────────────────────────────────────

function buildContextInfo(options = {}) {
  const ctx = {};
  if (options.quoted) {
    ctx.stanzaId      = options.quoted.key?.id;
    ctx.participant   = options.quoted.key?.participant || options.quoted.key?.remoteJid;
    ctx.quotedMessage = options.quoted.message;
  }
  if (options.mentions?.length) ctx.mentionedJid = options.mentions;
  if (options.expiration)       ctx.expiration    = options.expiration;
  return Object.keys(ctx).length ? ctx : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
//  TEXT
// ─────────────────────────────────────────────────────────────────────────────

function buildTextMessage(text, options = {}) {
  const ctx = buildContextInfo(options);
  if (!ctx) return { conversation: text };
  return { extendedTextMessage: { text, contextInfo: ctx } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MEDIA BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildImageMessage(media, options = {}) {
  return { imageMessage: {
    url: typeof media === 'string' ? media : undefined,
    mimetype: options.mimetype || 'image/jpeg', caption: options.caption || '',
    fileLength: options.fileLength || 0, height: options.height || 0, width: options.width || 0,
    mediaKey: options.mediaKey, fileEncSha256: options.fileEncSha256, fileSha256: options.fileSha256,
    directPath: options.directPath, contextInfo: buildContextInfo(options),
  }};
}

function buildVideoMessage(media, options = {}) {
  return { videoMessage: {
    url: typeof media === 'string' ? media : undefined,
    mimetype: options.mimetype || 'video/mp4', caption: options.caption || '',
    fileLength: options.fileLength || 0, seconds: options.seconds || 0,
    mediaKey: options.mediaKey, fileEncSha256: options.fileEncSha256, fileSha256: options.fileSha256,
    directPath: options.directPath, gifPlayback: options.gifPlayback || false,
    contextInfo: buildContextInfo(options),
  }};
}

function buildAudioMessage(media, options = {}) {
  return { audioMessage: {
    url: typeof media === 'string' ? media : undefined,
    mimetype: options.mimetype || 'audio/ogg; codecs=opus',
    fileLength: options.fileLength || 0, seconds: options.seconds || 0,
    ptt: options.ptt !== false,
    mediaKey: options.mediaKey, fileEncSha256: options.fileEncSha256, fileSha256: options.fileSha256,
    directPath: options.directPath, contextInfo: buildContextInfo(options),
  }};
}

function buildDocumentMessage(media, options = {}) {
  return { documentMessage: {
    url: typeof media === 'string' ? media : undefined,
    mimetype: options.mimetype || 'application/octet-stream',
    fileName: options.fileName || 'file', fileLength: options.fileLength || 0,
    mediaKey: options.mediaKey, fileEncSha256: options.fileEncSha256, fileSha256: options.fileSha256,
    directPath: options.directPath, contextInfo: buildContextInfo(options),
  }};
}

function buildStickerMessage(media, options = {}) {
  return { stickerMessage: {
    url: typeof media === 'string' ? media : undefined,
    mimetype: options.mimetype || 'image/webp', fileLength: options.fileLength || 0,
    mediaKey: options.mediaKey, fileEncSha256: options.fileEncSha256, fileSha256: options.fileSha256,
    directPath: options.directPath, isAnimated: options.isAnimated || false,
    contextInfo: buildContextInfo(options),
  }};
}

// ─────────────────────────────────────────────────────────────────────────────
//  ★ BUTTON MESSAGE — patched for WA MD rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a buttonsMessage with tap-to-reply buttons.
 *
 * @param {{ text, footer, header, buttons: Array<{ buttonId, displayText }> }} params
 * @param {object} options  Standard options (quoted, mentions, etc.)
 *
 * @example
 * buildButtonMessage({
 *   text: 'Pilih opsi:',
 *   footer: 'Fotk v1',
 *   header: 'Menu',
 *   buttons: [
 *     { buttonId: 'btn_1', displayText: '✅ Ya' },
 *     { buttonId: 'btn_2', displayText: '❌ Tidak' },
 *   ],
 * })
 */
function buildButtonMessage({ text, footer = '', header = '', buttons = [] }, options = {}) {
  return {
    buttonsMessage: {
      contentText: text,
      footerText:  footer,
      headerType:  header ? 1 : 4, // 1 = TEXT, 4 = EMPTY
      text:        header || undefined,
      buttons: buttons.map((btn, i) => ({
        buttonId:   btn.buttonId   || `btn_${i + 1}`,
        buttonText: { displayText: btn.displayText || `Button ${i + 1}` },
        type: 1, // RESPONSE
      })),
      contextInfo: buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ★ LIST MESSAGE — patched for WA MD (SINGLE_SELECT only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a listMessage (dropdown picker).
 * listType is locked to 1 (SINGLE_SELECT) — the only type WA MD renders.
 *
 * @param {{ text, footer, title, buttonText, sections }} params
 *
 * @example
 * buildListMessage({
 *   text: 'Pilih menu:',
 *   footer: 'Fotk v1',
 *   title: 'Bot Menu',
 *   buttonText: '📋 Buka',
 *   sections: [{ title: 'Utilitas', rows: [{ rowId: 'ping', title: 'Ping', description: 'Cek bot' }] }],
 * })
 */
function buildListMessage({ text, footer = '', title = '', buttonText = 'Open', sections = [] }, options = {}) {
  return {
    listMessage: {
      title,
      description:  text,
      buttonText,
      listType:     1, // SINGLE_SELECT
      sections: sections.map((sec) => ({
        title: sec.title || '',
        rows:  (sec.rows || []).map((row, i) => ({
          rowId:       row.rowId       || `row_${i + 1}`,
          title:       row.title       || `Option ${i + 1}`,
          description: row.description || '',
        })),
      })),
      footerText:  footer,
      contextInfo: buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ★ TEMPLATE MESSAGE — URL / Call / QuickReply buttons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a hydratedTemplateMessage with URL, call, or quick-reply buttons.
 * Uses hydratedTemplate format — the only type rendered on non-Business accounts.
 *
 * @param {{ text, footer, header, buttons: Array<{ type, displayText, url?, phoneNumber?, id? }> }} params
 *
 * @example
 * buildTemplateMessage({
 *   text: 'Info kontak:',
 *   footer: 'Fotk v1',
 *   header: 'Kontak',
 *   buttons: [
 *     { type: 'url',        displayText: '🌐 Website',  url: 'https://example.com' },
 *     { type: 'call',       displayText: '📞 Telepon',  phoneNumber: '+62812xxx' },
 *     { type: 'quickReply', displayText: '✅ OK',        id: 'confirm' },
 *   ],
 * })
 */
function buildTemplateMessage({ text, footer = '', header = '', buttons = [] }, options = {}) {
  const hydratedButtons = buttons.map((btn, i) => {
    switch (btn.type) {
      case 'url':
        return { index: i, urlButton:       { displayText: btn.displayText || 'Open', url: btn.url || '' } };
      case 'call':
        return { index: i, callButton:      { displayText: btn.displayText || 'Call', phoneNumber: btn.phoneNumber || '' } };
      case 'quickReply': default:
        return { index: i, quickReplyButton: { displayText: btn.displayText || `Option ${i + 1}`, id: btn.id || `qr_${i + 1}` } };
    }
  });

  const hydratedTemplate = {
    hydratedContentText: text,
    hydratedFooterText:  footer,
    hydratedButtons,
    templateId:          generateMessageID(),
    contextInfo:         buildContextInfo(options),
  };
  if (header) hydratedTemplate.hydratedTitleText = header;

  return { templateMessage: { hydratedTemplate } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  REACTION & LOCATION
// ─────────────────────────────────────────────────────────────────────────────

function buildReactionMessage(key, emoji) {
  return { reactionMessage: { key, text: emoji, senderTimestampMs: Date.now() } };
}

function buildLocationMessage(lat, lng, options = {}) {
  return { locationMessage: {
    degreesLatitude:  lat,
    degreesLongitude: lng,
    name:             options.name    || '',
    address:          options.address || '',
    contextInfo:      buildContextInfo(options),
  }};
}

module.exports = {
  buildMessageEnvelope,
  buildContextInfo,
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
};
