'use strict';

const EventEmitter = require('events');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const baileys = require('../../vendor/wa-engine');

const makeBaileysSocket = baileys.default || baileys.makeWASocket;
const generateWAMessageFromContent = baileys.generateWAMessageFromContent;
const proto = baileys.proto;
const Browsers = baileys.Browsers;
const DEFAULT_WA_VERSION = [2, 3000, 1037496389];
let cachedWaVersion = DEFAULT_WA_VERSION;
let versionFetchPromise = null;

if (typeof makeBaileysSocket !== 'function') {
  throw new Error('Failed to load makeWASocket from internal WA engine');
}

const FORWARDED_EVENTS = [
  'connection.update',
  'creds.update',
  'messages.upsert',
  'messages.update',
  'message-receipt.update',
  'presence.update',
  'group-participants.update',
  'groups.update',
  'chats.update',
  'contacts.update',
  'call',
];

function normalizePhoneNumber(input) {
  return String(input || '').replace(/\D/g, '');
}

function isValidVersion(version) {
  return Array.isArray(version)
    && version.length === 3
    && version.every((v) => Number.isInteger(v) && v >= 0);
}

async function fetchLatestWaWebVersion() {
  if (versionFetchPromise) return versionFetchPromise;

  const fetcher = baileys.fetchLatestWaWebVersion;
  if (typeof fetcher !== 'function') return cachedWaVersion;

  versionFetchPromise = fetcher()
    .then((result) => {
      const version = result?.version;
      if (isValidVersion(version)) cachedWaVersion = version;
      return cachedWaVersion;
    })
    .catch(() => cachedWaVersion)
    .finally(() => {
      versionFetchPromise = null;
    });

  return versionFetchPromise;
}

function getWaWebVersion() {
  return cachedWaVersion;
}

function toQuickReplyButtons(buttons = []) {
  return buttons.map((btn, i) => {
    const id = btn?.buttonId || btn?.id || `btn_${i + 1}`;
    const displayText = btn?.displayText || btn?.buttonText?.displayText || `Button ${i + 1}`;
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: displayText, id }),
    };
  });
}

function toListSections(sections = []) {
  return sections.map((section, sectionIndex) => ({
    title: section?.title || '',
    highlight_label: section?.highlight_label || '',
    rows: (section?.rows || []).map((row, rowIndex) => ({
      id: row?.rowId || row?.id || `row_${sectionIndex + 1}_${rowIndex + 1}`,
      header: row?.header || '',
      title: row?.title || `Option ${rowIndex + 1}`,
      description: row?.description || '',
    })),
  }));
}

function createInteractiveNativeFlowMessage(content) {
  if (!proto?.Message?.InteractiveMessage) return null;

  const hasNativeFlow = !!content?.nativeFlowMessage;
  const hasButtons = Array.isArray(content?.buttons) && content.buttons.length > 0;
  const hasSections = Array.isArray(content?.sections) && content.sections.length > 0;
  if (!hasNativeFlow && !hasButtons && !hasSections) return null;

  let nativeFlowButtons = [];
  let messageParamsJson = '';
  let messageVersion;

  if (hasNativeFlow) {
    messageParamsJson = content.nativeFlowMessage?.messageParamsJson || '';
    messageVersion = content.nativeFlowMessage?.messageVersion;
    nativeFlowButtons = (content.nativeFlowMessage?.buttons || []).map((btn) => ({
      name: btn?.name || 'quick_reply',
      buttonParamsJson: btn?.buttonParamsJson || '{}',
    }));
  } else if (hasSections) {
    nativeFlowButtons = [{
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: content.buttonText || 'Pilih menu',
        sections: toListSections(content.sections),
      }),
    }];
    messageParamsJson = '';
    messageVersion = 1;
  } else {
    nativeFlowButtons = toQuickReplyButtons(content.buttons);
    messageParamsJson = '';
    messageVersion = 1;
  }

  if (!nativeFlowButtons.length) return null;

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({
      text: content.text || content.caption || 'Pilih opsi di bawah ini:',
    }),
    footer: content.footer
      ? proto.Message.InteractiveMessage.Footer.create({ text: content.footer })
      : undefined,
    header: (content.header || content.title)
      ? proto.Message.InteractiveMessage.Header.create({
        title: content.header || content.title,
        hasMediaAttachment: false,
      })
      : undefined,
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      messageParamsJson,
      ...(Number.isInteger(messageVersion) ? { messageVersion } : {}),
      buttons: nativeFlowButtons,
    }),
  });

  return {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage,
      },
    },
  };
}

// Warm-up cache as soon as module is loaded.
void fetchLatestWaWebVersion();

function createCompatSocket(config = {}) {
  if (!config.auth) throw new Error('makeWASocket: auth is required');

  const emitter = new EventEmitter();
  const printQRInTerminal = config.printQRInTerminal !== false;
  const userLogger = config.logger;
  const enableWhatsAppWebMd = config.whatsappWebMd === true || config.whatsappWebMD === true;
  const browserConfig = config.browser
    || (enableWhatsAppWebMd && typeof Browsers?.macOS === 'function'
      ? Browsers.macOS('Desktop')
      : undefined);
  const {
    whatsappWebMd: _unusedWhatsappWebMd,
    whatsappWebMD: _unusedWhatsappWebMD,
    ...socketConfig
  } = config;

  const socket = makeBaileysSocket({
    ...socketConfig,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    mobile: false,
    version: config.version || getWaWebVersion(),
    ...(enableWhatsAppWebMd ? { syncFullHistory: true } : {}),
    ...(browserConfig ? { browser: browserConfig } : {}),
  });

  const unbind = [];
  const bindEvent = (eventName, handler) => {
    socket.ev.on(eventName, handler);
    unbind.push(() => socket.ev.off(eventName, handler));
  };

  for (const eventName of FORWARDED_EVENTS) {
    bindEvent(eventName, (payload) => {
      if (eventName === 'connection.update') {
        if (payload?.connection === 'close') socket._closed = true;
        if (payload?.connection === 'open' || payload?.connection === 'connecting') socket._closed = false;

        if (payload?.qr && printQRInTerminal) {
          if (userLogger?.info) userLogger.info('QR code received');
          qrcode.generate(payload.qr, { small: true });
        }
      }
      emitter.emit(eventName, payload);
    });
  }

  if (typeof config.saveCreds === 'function') {
    bindEvent('creds.update', config.saveCreds);
  }

  const originalRequestPairingCode =
    typeof socket.requestPairingCode === 'function'
      ? socket.requestPairingCode.bind(socket)
      : null;
  const originalSendMessage =
    typeof socket.sendMessage === 'function'
      ? socket.sendMessage.bind(socket)
      : null;

  socket.requestPairingCode = async (rawPhone) => {
    if (!originalRequestPairingCode) {
      throw new Error('requestPairingCode is not available in this socket version');
    }

    const phone = normalizePhoneNumber(rawPhone);
    if (!phone || phone.length < 7) {
      throw new Error(`requestPairingCode: invalid phone number "${rawPhone}"`);
    }

    const code = await originalRequestPairingCode(phone);
    emitter.emit('pairing-code', code || null);
    return code || null;
  };

  socket.sendMessage = async (jid, content, options = {}) => {
    const interactiveContent = createInteractiveNativeFlowMessage(content);
    if (!interactiveContent) {
      if (!originalSendMessage) throw new Error('sendMessage is not available in this socket version');
      return originalSendMessage(jid, content, options);
    }

    if (typeof generateWAMessageFromContent !== 'function') {
      throw new Error('generateWAMessageFromContent is not available in this Baileys version');
    }

    const msg = generateWAMessageFromContent(jid, interactiveContent, {
      userJid: socket.user?.id,
      quoted: options.quoted,
      messageId: options.messageId,
      timestamp: options.timestamp,
      ephemeralExpiration: options.ephemeralExpiration,
    });

    await socket.relayMessage(jid, msg.message, { messageId: msg.key.id });
    return msg;
  };

  const originalEnd = typeof socket.end === 'function' ? socket.end.bind(socket) : null;

  socket.end = async (reason) => {
    if (originalEnd) {
      socket._closed = true;
      return Promise.resolve(originalEnd(reason));
    }

    socket._closed = true;
    try { socket.ws?.close(); } catch {}
    emitter.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: reason || new Error('Closed'), date: new Date() },
    });
  };

  socket.on = emitter.on.bind(emitter);
  socket.once = emitter.once.bind(emitter);
  socket.off = emitter.off.bind(emitter);
  socket.removeListener = emitter.removeListener.bind(emitter);
  socket.removeAllListeners = emitter.removeAllListeners.bind(emitter);
  socket.emit = emitter.emit.bind(emitter);

  socket._closed = false;
  socket._destroyCompatBridge = () => {
    for (const fn of unbind) fn();
    emitter.removeAllListeners();
  };

  return socket;
}

class WASocket {
  constructor(config = {}) {
    return createCompatSocket(config);
  }
}

function makeWASocket(config = {}) {
  return createCompatSocket(config);
}

module.exports = {
  WASocket,
  makeWASocket,
  fetchLatestWaWebVersion,
  getWaWebVersion,
  Browsers,
};
