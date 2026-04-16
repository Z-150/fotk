'use strict';

/**
 * Message/builder.js — v2.0
 * ─────────────────────────
 * Builder functions for ALL WhatsApp message types.
 *
 * ★ NEW in v2:
 *   buildGroupStatusV2Message   — Group Status V2
 *   buildAlbumMessage           — Multi-image album
 *   buildEventMessage           — WA Event / calendar invite
 *   buildPollResultMessage      — Poll result display
 *   buildInteractiveMessage     — Native flow (bottom_sheet, single_select, cta_*)
 *   buildInteractiveWithDocBuffer — Interactive + document buffer attachment
 *   buildProductMessage         — WA Catalog product card
 *   buildRequestPaymentMessage  — Payment request
 */

const { generateMessageID, unixTimestampSeconds } = require('../Utils');
const { isJidGroup } = require('../Types');

// ─────────────────────────────────────────────
//  BASE ENVELOPE
// ─────────────────────────────────────────────

function buildMessageEnvelope(jid, message, options = {}) {
  const id = options.messageId || generateMessageID();
  return {
    key: {
      remoteJid:   jid,
      fromMe:      true,
      id,
      participant: isJidGroup(jid) ? options.participant : undefined,
    },
    message,
    messageTimestamp: unixTimestampSeconds(),
    status:   1,
    pushName: options.pushName || '',
  };
}

// ─────────────────────────────────────────────
//  CONTEXT INFO
// ─────────────────────────────────────────────

function buildContextInfo(options = {}) {
  const ctx = {};
  if (options.quoted) {
    const q = options.quoted;
    ctx.stanzaId      = q.key?.id;
    ctx.participant   = q.key?.participant || q.key?.remoteJid;
    ctx.quotedMessage = q.message;
  }
  if (options.mentions?.length)  ctx.mentionedJid    = options.mentions;
  if (options.expiration)        ctx.expiration       = options.expiration;
  if (options.forwardingScore)   ctx.forwardingScore  = options.forwardingScore;
  if (options.isForwarded)       ctx.isForwarded      = true;
  if (options.externalAdReply) {
    ctx.externalAdReply = {
      title:                 options.externalAdReply.title                 || '',
      body:                  options.externalAdReply.body                  || '',
      mediaType:             options.externalAdReply.mediaType             || 1,
      renderLargerThumbnail: options.externalAdReply.renderLargerThumbnail !== false,
      showAdAttribution:     options.externalAdReply.showAdAttribution     !== false,
      sourceUrl:             options.externalAdReply.sourceUrl             || '',
      thumbnail:             options.externalAdReply.thumbnail,
      ...options.externalAdReply,
    };
  }
  return Object.keys(ctx).length ? ctx : undefined;
}

// ─────────────────────────────────────────────
//  TEXT
// ─────────────────────────────────────────────

function buildTextMessage(text, options = {}) {
  if (!options.quoted && !options.mentions?.length && !options.externalAdReply) {
    return { conversation: text };
  }
  return { extendedTextMessage: { text, contextInfo: buildContextInfo(options) } };
}

// ─────────────────────────────────────────────
//  MEDIA
// ─────────────────────────────────────────────

function buildImageMessage(media, options = {}) {
  return {
    imageMessage: {
      url:           typeof media === 'string' ? media : undefined,
      mimetype:      options.mimetype    || 'image/jpeg',
      caption:       options.caption     || '',
      fileLength:    options.fileLength  || 0,
      height:        options.height      || 0,
      width:         options.width       || 0,
      mediaKey:      options.mediaKey,
      fileEncSha256: options.fileEncSha256,
      fileSha256:    options.fileSha256,
      directPath:    options.directPath,
      jpegThumbnail: options.jpegThumbnail,
      contextInfo:   buildContextInfo(options),
    },
  };
}

function buildVideoMessage(media, options = {}) {
  return {
    videoMessage: {
      url:           typeof media === 'string' ? media : undefined,
      mimetype:      options.mimetype   || 'video/mp4',
      caption:       options.caption    || '',
      fileLength:    options.fileLength || 0,
      seconds:       options.seconds    || 0,
      mediaKey:      options.mediaKey,
      fileEncSha256: options.fileEncSha256,
      fileSha256:    options.fileSha256,
      directPath:    options.directPath,
      gifPlayback:   options.gifPlayback || false,
      contextInfo:   buildContextInfo(options),
    },
  };
}

function buildAudioMessage(media, options = {}) {
  return {
    audioMessage: {
      url:           typeof media === 'string' ? media : undefined,
      mimetype:      options.mimetype   || 'audio/ogg; codecs=opus',
      fileLength:    options.fileLength || 0,
      seconds:       options.seconds    || 0,
      ptt:           options.ptt !== false,
      mediaKey:      options.mediaKey,
      fileEncSha256: options.fileEncSha256,
      fileSha256:    options.fileSha256,
      directPath:    options.directPath,
      contextInfo:   buildContextInfo(options),
    },
  };
}

function buildDocumentMessage(media, options = {}) {
  return {
    documentMessage: {
      url:           typeof media === 'string' ? media : undefined,
      mimetype:      options.mimetype  || 'application/octet-stream',
      fileName:      options.fileName  || 'file',
      fileLength:    options.fileLength || 0,
      mediaKey:      options.mediaKey,
      fileEncSha256: options.fileEncSha256,
      fileSha256:    options.fileSha256,
      directPath:    options.directPath,
      jpegThumbnail: options.jpegThumbnail,
      contextInfo:   buildContextInfo(options),
    },
  };
}

function buildStickerMessage(media, options = {}) {
  return {
    stickerMessage: {
      url:           typeof media === 'string' ? media : undefined,
      mimetype:      options.mimetype || 'image/webp',
      fileLength:    options.fileLength || 0,
      mediaKey:      options.mediaKey,
      fileEncSha256: options.fileEncSha256,
      fileSha256:    options.fileSha256,
      directPath:    options.directPath,
      isAnimated:    options.isAnimated || false,
      contextInfo:   buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────
//  BUTTON MESSAGE
// ─────────────────────────────────────────────

function buildButtonMessage({ text, footer = '', header = '', buttons = [] }, options = {}) {
  return {
    buttonsMessage: {
      contentText: text,
      footerText:  footer,
      headerType:  header ? 1 : 4,
      text:        header || undefined,
      buttons: buttons.map((btn, i) => ({
        buttonId:   btn.buttonId   || `btn_${i + 1}`,
        buttonText: { displayText: btn.displayText || `Button ${i + 1}` },
        type: 1,
      })),
      contextInfo: buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────
//  LIST MESSAGE
// ─────────────────────────────────────────────

function buildListMessage({ text, footer = '', title = '', buttonText = 'Open', sections = [] }, options = {}) {
  return {
    listMessage: {
      title,
      description: text,
      buttonText,
      listType:    1,
      sections: sections.map((sec) => ({
        title: sec.title || '',
        rows: (sec.rows || []).map((row, i) => ({
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

// ─────────────────────────────────────────────
//  TEMPLATE MESSAGE
// ─────────────────────────────────────────────

function buildTemplateMessage({ text, footer = '', header = '', buttons = [] }, options = {}) {
  const hydratedButtons = buttons.map((btn, i) => {
    switch (btn.type) {
      case 'url':  return { index: i, urlButton:       { displayText: btn.displayText || 'Open URL', url: btn.url || '' } };
      case 'call': return { index: i, callButton:      { displayText: btn.displayText || 'Call',     phoneNumber: btn.phoneNumber || '' } };
      default:     return { index: i, quickReplyButton:{ displayText: btn.displayText || `Option ${i + 1}`, id: btn.id || `qr_${i + 1}` } };
    }
  });
  const ht = { hydratedContentText: text, hydratedFooterText: footer, hydratedButtons, templateId: generateMessageID(), contextInfo: buildContextInfo(options) };
  if (header) ht.hydratedTitleText = header;
  return { templateMessage: { hydratedTemplate: ht } };
}

// ─────────────────────────────────────────────
//  REACTION
// ─────────────────────────────────────────────

function buildReactionMessage(key, emoji) {
  return { reactionMessage: { key, text: emoji, senderTimestampMs: Date.now() } };
}

// ─────────────────────────────────────────────
//  LOCATION
// ─────────────────────────────────────────────

function buildLocationMessage(lat, lon, options = {}) {
  return {
    locationMessage: {
      degreesLatitude:  lat,
      degreesLongitude: lon,
      name:    options.name    || '',
      address: options.address || '',
      contextInfo: buildContextInfo(options),
    },
  };
}

// ═════════════════════════════════════════════
//  ★ NEW v2 BUILDERS
// ═════════════════════════════════════════════

// ─────────────────────────────────────────────
//  GROUP STATUS V2
// ─────────────────────────────────────────────
/**
 * Group Status V2 message — renders as system banner in group timeline.
 * Payload: { groupStatusMessage: { text: "Hello World" } }
 */
function buildGroupStatusV2Message({ text }, options = {}) {
  return {
    groupStatusV2BroadcastLinkedGroupMessage: {
      message: {
        extendedTextMessage: {
          text,
          contextInfo: buildContextInfo(options),
        },
      },
    },
  };
}

// ─────────────────────────────────────────────
//  ALBUM MESSAGE  (Multi-image carousel)
// ─────────────────────────────────────────────
/**
 * Album = swipeable image/video carousel.
 * Payload: { albumMessage: [{ image: buffer/url, caption }, ...] }
 */
function buildAlbumMessage(items = [], options = {}) {
  const messages = items.map((item) => {
    const isVideo = !!item.video;
    const media   = item.image || item.video;
    const inner   = isVideo
      ? buildVideoMessage(media, { mimetype: item.mimetype || 'video/mp4', caption: item.caption || '', ...item })
      : buildImageMessage(media, { mimetype: item.mimetype || 'image/jpeg', caption: item.caption || '', ...item });
    return { key: { id: generateMessageID(), fromMe: true }, message: inner };
  });

  const imgCount = messages.filter(m => m.message.imageMessage).length;
  const vidCount = messages.filter(m => m.message.videoMessage).length;

  return {
    albumMessage: {
      expectedImageCount: imgCount,
      expectedVideoCount: vidCount,
      messages,
      contextInfo: buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────
//  EVENT MESSAGE
// ─────────────────────────────────────────────
/**
 * WA Event / calendar invite.
 * Payload: { eventMessage: { name, description, location, startTime, endTime, ... } }
 */
function buildEventMessage(params = {}, options = {}) {
  const {
    isCanceled         = false,
    name               = '',
    description        = '',
    location           = null,
    joinLink           = '',
    startTime,
    endTime,
    extraGuestsAllowed = false,
    joinStatus         = 0,
  } = params;

  const evt = {
    isCanceled,
    name,
    description,
    joinLink,
    extraGuestsAllowed,
    joinStatus,
    contextInfo: buildContextInfo(options),
  };

  // WA proto uses int64 for timestamps
  if (startTime) evt.startTime = String(startTime);
  if (endTime)   evt.endTime   = String(endTime);

  if (location) {
    evt.location = {
      degreesLatitude:  location.degreesLatitude  || 0,
      degreesLongitude: location.degreesLongitude || 0,
      name:             location.name             || '',
      address:          location.address          || '',
    };
  }

  return { eventMessage: evt };
}

// ─────────────────────────────────────────────
//  POLL RESULT MESSAGE
// ─────────────────────────────────────────────
/**
 * Renders current vote tally for a poll.
 * Payload: { pollResultMessage: { name, pollVotes: [{optionName, optionVoteCount}] } }
 */
function buildPollResultMessage({ name = '', pollVotes = [] }, options = {}) {
  return {
    pollCreationMessage: {
      name,
      options: pollVotes.map((v) => ({ optionName: v.optionName || '' })),
      // Attach vote counts as extended metadata
      pollResultMessage: {
        pollVotes: pollVotes.map((v) => ({
          optionName:      v.optionName || '',
          optionVoteCount: parseInt(v.optionVoteCount || '0', 10),
        })),
      },
      contextInfo: buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────
//  INTERACTIVE MESSAGE  ★★ (Native Flow)
// ─────────────────────────────────────────────
/**
 * The most powerful WA interactive message — MD only.
 *
 * Supports:
 *   cta_copy, cta_url, cta_call, cta_reminder, cta_cancel_reminder,
 *   send_location, address_message, single_select, quick_reply, bottom_sheet
 *
 * Payload:
 * {
 *   interactiveMessage: {
 *     header:  "Header teks",
 *     body:    "Body teks",
 *     footer:  "Footer teks",
 *     nativeFlowMessage: {
 *       messageParamsJson: '{"flow_token":"..."}',
 *       buttons: [
 *         { name: "cta_copy",      buttonParamsJson: '{"display_text":"Salin","copy_code":"ABC123"}' },
 *         { name: "cta_url",       buttonParamsJson: '{"display_text":"Website","url":"https://x.com","merchant_url":"https://x.com"}' },
 *         { name: "cta_call",      buttonParamsJson: '{"display_text":"Telepon","phone_number":"+62812"}' },
 *         { name: "single_select", buttonParamsJson: JSON.stringify({ title:"Pilih", sections:[{ title:"S1", highlight_label:"", rows:[{ header:"R1", title:"Title", description:"Desc", id:"row_1" }] }] }) },
 *         { name: "quick_reply",   buttonParamsJson: '{"display_text":"Setuju","id":"agree"}' },
 *       ],
 *     },
 *   }
 * }
 */
function buildInteractiveMessage(params = {}, options = {}) {
  const {
    header          = '',
    body            = '',
    footer          = '',
    nativeFlowMessage,
    // Optional header media
    headerImage, headerVideo, headerDocument,
    headerMimetype, headerFileName, headerThumbnail,
  } = params;

  let headerNode;

  if (headerImage) {
    headerNode = {
      hasMediaAttachment: true,
      imageMessage: {
        url:           typeof headerImage === 'string' ? headerImage : undefined,
        mimetype:      headerMimetype   || 'image/jpeg',
        jpegThumbnail: headerThumbnail,
        fileLength:    0,
      },
    };
  } else if (headerVideo) {
    headerNode = {
      hasMediaAttachment: true,
      videoMessage: {
        url:      typeof headerVideo === 'string' ? headerVideo : undefined,
        mimetype: headerMimetype || 'video/mp4',
        fileLength: 0,
      },
    };
  } else if (headerDocument) {
    headerNode = {
      hasMediaAttachment: true,
      documentMessage: {
        url:           typeof headerDocument === 'string' ? headerDocument : undefined,
        mimetype:      headerMimetype  || 'application/octet-stream',
        fileName:      headerFileName  || 'file',
        jpegThumbnail: headerThumbnail,
        fileLength:    0,
      },
    };
  } else {
    // Plain text header
    headerNode = { hasMediaAttachment: false, title: header };
  }

  const nativeFlow = nativeFlowMessage ? {
    messageParamsJson: nativeFlowMessage.messageParamsJson || '',
    buttons: (nativeFlowMessage.buttons || []).map((btn) => ({
      name:             btn.name             || 'quick_reply',
      buttonParamsJson: btn.buttonParamsJson || '{}',
    })),
  } : undefined;

  return {
    interactiveMessage: {
      header:            headerNode,
      body:              { text: body },
      footer:            { text: footer },
      nativeFlowMessage: nativeFlow,
      contextInfo:       buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────
//  INTERACTIVE + DOCUMENT BUFFER  ★★
// ─────────────────────────────────────────────
/**
 * Interactive message where the header is a LOCAL BUFFER document.
 * The socket layer handles uploading the buffer to WA CDN before sending.
 *
 * Payload:
 * {
 *   interactiveMessage: {
 *     headerDocument:  Buffer,           // from fs.readFileSync(...)
 *     headerMimetype:  'application/pdf',
 *     headerFileName:  'laporan.pdf',
 *     headerThumbnail: Buffer,           // optional JPEG thumb
 *     body:   "...",
 *     footer: "...",
 *     contextInfo: { externalAdReply: {...} },
 *     nativeFlowMessage: { buttons: [...] },
 *   }
 * }
 */
function buildInteractiveWithDocBuffer(params = {}, options = {}) {
  const {
    headerDocument,
    headerMimetype  = 'application/octet-stream',
    headerFileName  = 'document',
    headerThumbnail,
    body            = '',
    footer          = '',
    nativeFlowMessage,
  } = params;

  const docBuf = Buffer.isBuffer(headerDocument) ? headerDocument : Buffer.from(headerDocument || '');

  const nativeFlow = nativeFlowMessage ? {
    messageParamsJson: nativeFlowMessage.messageParamsJson || '',
    buttons: (nativeFlowMessage.buttons || []).map((btn) => ({
      name:             btn.name             || 'quick_reply',
      buttonParamsJson: btn.buttonParamsJson || '{}',
    })),
  } : undefined;

  return {
    interactiveMessage: {
      header: {
        hasMediaAttachment: true,
        documentMessage: {
          mimetype:      headerMimetype,
          fileName:      headerFileName,
          fileLength:    docBuf.length,
          jpegThumbnail: Buffer.isBuffer(headerThumbnail) ? headerThumbnail : undefined,
          _rawBuffer:    docBuf,   // consumed by socket upload layer
        },
      },
      body:              { text: body },
      footer:            { text: footer },
      nativeFlowMessage: nativeFlow,
      contextInfo:       buildContextInfo(options),
      _hasDocBuffer:     true,    // flag for socket
    },
  };
}

// ─────────────────────────────────────────────
//  PRODUCT MESSAGE
// ─────────────────────────────────────────────
/**
 * WA Catalog product card.
 *
 * Payload:
 * {
 *   productMessage: {
 *     title, description, thumbnail (Buffer|url),
 *     productId, retailerId, url,
 *     priceAmount1000: 50000000,   // IDR 50.000 → 50000 * 1000
 *     currencyCode: "IDR",
 *     buttons: [{ buttonId, displayText }],
 *   }
 * }
 */
function buildProductMessage(params = {}, options = {}) {
  const {
    title            = '',
    description      = '',
    thumbnail,
    productId        = '',
    retailerId       = '',
    url              = '',
    priceAmount1000  = 0,
    currencyCode     = 'IDR',
    buttons          = [],
    catalogId        = '',
    businessOwnerJid,
  } = params;

  return {
    productMessage: {
      product: {
        productImage: {
          url:           typeof thumbnail === 'string' ? thumbnail : undefined,
          mimetype:      'image/jpeg',
          jpegThumbnail: Buffer.isBuffer(thumbnail) ? thumbnail : undefined,
        },
        productId,
        title,
        description,
        currencyCode,
        priceAmount1000: String(Math.round(Number(priceAmount1000))),
        retailerId,
        url,
        isHidden: false,
      },
      catalogId,
      url,
      ...(businessOwnerJid ? { businessOwnerJid } : {}),
      ...(buttons.length ? {
        buttons: buttons.map((btn, i) => ({
          buttonId:   btn.buttonId   || `pbtn_${i + 1}`,
          buttonText: { displayText: btn.displayText || `Option ${i + 1}` },
          type: 1,
        })),
      } : {}),
      contextInfo: buildContextInfo(options),
    },
  };
}

// ─────────────────────────────────────────────
//  REQUEST PAYMENT MESSAGE
// ─────────────────────────────────────────────
/**
 * WA Request Payment message.
 *
 * Payload:
 * {
 *   requestPaymentMessage: {
 *     currency:    "IDR",
 *     amount:      50000,
 *     from:        "628xxx@s.whatsapp.net",
 *     sticker:     Buffer | url,
 *     background: { id, fileLength, width, height, mimetype, placeholderArgb, textArgb, subtextArgb },
 *     noteMessage: "Pembayaran pesanan #001",
 *   }
 * }
 */
function buildRequestPaymentMessage(params = {}, options = {}) {
  const {
    currency         = 'IDR',
    amount           = 0,
    from,
    sticker,
    background,
    noteMessage      = '',
    expiryTimestamp,
  } = params;

  const msg = {
    currencyCodeIso4217: currency,
    amount1000:          String(Math.round(Number(amount) * 1000)),
    requestFrom:         from || '',
    contextInfo:         buildContextInfo(options),
  };

  if (noteMessage) msg.noteMessage = { conversation: noteMessage };
  if (expiryTimestamp) msg.expiryTimestamp = String(expiryTimestamp);

  if (sticker) {
    msg.amount1000Image = {
      url:           typeof sticker === 'string' ? sticker : undefined,
      mimetype:      'image/jpeg',
      jpegThumbnail: Buffer.isBuffer(sticker) ? sticker : undefined,
    };
  }

  if (background) {
    msg.background = {
      id:              background.id              || '1',
      fileLength:      background.fileLength      || 0,
      width:           background.width           || 512,
      height:          background.height          || 512,
      mimetype:        background.mimetype        || 'image/png',
      placeholderArgb: background.placeholderArgb || '#FFFFFF',
      textArgb:        background.textArgb        || '#000000',
      subtextArgb:     background.subtextArgb     || '#888888',
    };
  }

  return { requestPaymentMessage: msg };
}

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  buildMessageEnvelope,
  buildContextInfo,
  // standard
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
  // ★ v2
  buildGroupStatusV2Message,
  buildAlbumMessage,
  buildEventMessage,
  buildPollResultMessage,
  buildInteractiveMessage,
  buildInteractiveWithDocBuffer,
  buildProductMessage,
  buildRequestPaymentMessage,
};
