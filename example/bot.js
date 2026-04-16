'use strict';

// ─── IMPORTS — satu blok, zero duplicate deklarasi ───────────────────────────
const nodeFs       = require('fs');
const nodeReadline = require('readline');
const nodePath     = require('path');

const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestWaWebVersion,
  Browsers,
  DisconnectReason,
  isJidGroup,
} = require('../index');

// ─── AUTH PATH DI LUAR CWD ───────────────────────────────────────────────────
// Naik satu level dari process.cwd() — tidak ada di dalam folder script
const AUTH_DIR = nodePath.resolve(process.cwd(), '..', 'fotk_auth_info');

// ─── ANTI-SPAM LOGGER ────────────────────────────────────────────────────────
// Buang EAI_AGAIN, ETIMEDOUT, ECONNRESET agar terminal tidak spamming
const NOISE_CODES = ['EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'];

function isNetworkNoise(args) {
  const s = JSON.stringify(args);
  return NOISE_CODES.some((c) => s.includes(c));
}

const logger = {
  info:  (...a) => console.log('[INFO]',  ...a),
  warn:  (...a) => { if (!isNetworkNoise(a)) console.warn('[WARN]',  ...a); },
  error: (...a) => { if (!isNetworkNoise(a)) console.error('[ERROR]', ...a); },
  debug: () => {},
  trace: () => {},
};

// ─── STATE: ANTI RACE CONDITION ──────────────────────────────────────────────
let isAsking    = false; // lock: cegah prompt nomor ganda
let currentSock = null;  // referensi socket aktif
let activeRL    = null;  // readline instance aktif
let isRestarting = false;

// ─── READLINE HELPER ─────────────────────────────────────────────────────────
function closeRL() {
  if (activeRL) {
    try { activeRL.close(); } catch {}
    activeRL = null;
  }
}

function askQuestion(prompt) {
  return new Promise((resolve) => {
    closeRL(); // tutup yang lama dulu
    activeRL = nodeReadline.createInterface({
      input:  process.stdin,
      output: process.stdout,
    });
    // Guard ERR_USE_AFTER_CLOSE: kalau stdin sudah closed, resolve kosong
    activeRL.on('error', () => resolve(''));
    activeRL.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function resetAuthState() {
  await nodeFs.promises.rm(AUTH_DIR, { recursive: true, force: true });
}

function extractInteractiveResponseId(msg) {
  const paramsJson = msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (!paramsJson) return '';
  try {
    const parsed = JSON.parse(paramsJson);
    return parsed.id || parsed.row_id || parsed.selectedId || '';
  } catch {
    return '';
  }
}

function scheduleRestart(reason, resetAuth = false) {
  if (isRestarting) return;
  isRestarting = true;

  (async () => {
    isAsking = false;
    closeRL();

    const oldSock = currentSock;
    currentSock = null;

    if (oldSock) {
      try { await oldSock.end(new Error(reason)); } catch {}
    }

    if (resetAuth) {
      try {
        await resetAuthState();
      } catch (resetErr) {
        logger.error(`Gagal reset auth state: ${resetErr.message}`);
        process.exit(1);
      }
    }

    const delay = resetAuth ? 500 : 3000;
    setTimeout(() => {
      isRestarting = false;
      startBot().catch((restartErr) => {
        logger.error(`Gagal restart bot: ${restartErr.message}`);
        process.exit(1);
      });
    }, delay);
  })().catch((err) => {
    logger.error(`Gagal menjalankan restart: ${err.message}`);
    process.exit(1);
  });
}

// ─── MAIN BOT ────────────────────────────────────────────────────────────────
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const waVersion = await fetchLatestWaWebVersion();
  const desktopBrowser = typeof Browsers?.macOS === 'function'
    ? Browsers.macOS('Desktop')
    : undefined;
  logger.info(`Using WA Web version: ${waVersion.join('.')}`);

  // makeWASocket handle reconnect secara internal
  // JANGAN panggil startBot() rekursif di sini
  const sock = makeWASocket({
    auth: state,
    saveCreds,
    version: waVersion,
    logger,
    whatsappWebMd: true,
    ...(desktopBrowser ? { browser: desktopBrowser } : {}),
    printQRInTerminal: true,
    markOnlineOnConnect: true,
  });

  currentSock = sock;

  // ── CONNECTION UPDATE ───────────────────────────────────────────────────────
  sock.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

    // ── QR muncul → tawarkan pairing code ────────────────────────────────────
    if (qr) {
      console.log('\n📱 Scan QR di atas, atau gunakan Pairing Code.\n');

      // Guard race condition: jangan spawn prompt ganda
      if (isAsking) return;
      isAsking = true;

      try {
        const rawPhone = await askQuestion('📞 Masukkan nomor WA untuk pairing code (kosongkan = skip): ');
        closeRL();

        // Cek socket masih valid — bisa saja socket disconnect saat user mengetik
        if (!currentSock || currentSock._closed) {
          console.log('⚠️  Socket terputus saat input — reconnect sedang berjalan...');
          return;
        }

        // Sanitasi: strip semua non-digit
        const cleaned = rawPhone.replace(/\D/g, '');

        if (!cleaned) {
          console.log('ℹ️  Skip pairing code — menunggu scan QR...');
          return;
        }

        console.log(`🔑 Meminta pairing code untuk: ${cleaned}`);
        try {
          const code = await currentSock.requestPairingCode(cleaned);
          if (code) {
            console.log(`\n╔══════════════════════╗`);
            console.log(`║  PAIRING CODE: ${code}  ║`);
            console.log(`╚══════════════════════╝`);
            console.log('👆 Masukkan kode ini di WA → Linked Devices → Link with phone number\n');
          } else {
            console.log('⚠️  Server tidak mengembalikan pairing code.');
          }
        } catch (pairingErr) {
          // Non-fatal — jangan crash bot
          console.error(`❌ Gagal pairing code: ${pairingErr.message}`);
        }
      } finally {
        isAsking = false;
        closeRL();
      }
    }

    // ── Terhubung ─────────────────────────────────────────────────────────────
    if (connection === 'open') {
      isAsking = false; // reset lock
      closeRL();
      console.log('✅ Bot terhubung ke WhatsApp!');
    }

    // ── Terputus ──────────────────────────────────────────────────────────────
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      // Sesi invalid/logged-out: reset auth otomatis lalu start ulang
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log('\n🚫 Sesi expired / logged out. Reset auth & reconnect...\n');
        scheduleRestart('loggedOut', true);
        return;
      }

      const reasonText = statusCode || lastDisconnect?.error?.message || 'unknown';
      console.log(`🔄 Koneksi putus (${reasonText}) — menunggu auto-reconnect internal...`);
      return;
    }
  });

  sock.on('creds.update', saveCreds);

  // ── MESSAGE HANDLER ─────────────────────────────────────────────────────────
  sock.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const from     = msg.key.remoteJid;
      const pushName = msg.pushName || 'User';

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg.message?.templateButtonReplyMessage?.selectedId ||
        extractInteractiveResponseId(msg) ||
        '';

        

      const cmd = body?.trim().toLowerCase().split(' ')[0] || '';
      if (body) console.log(`📨 [${pushName}] ${body}`);

      try {
        switch (cmd) {

          case '.ping':
            await sock.sendMessage(from, { text: '🏓 *Pong!*' }, { quoted: msg });
            break;

          case '.menu':
            await sock.sendMessage(from, {
              title:      '🤖 Fotk Bot',
              text:       'Pilih menu di bawah ini:',
              footer:     'Fotk Library v1.0.0',
              buttonText: '📋 Buka Menu',
              sections: [
                {
                  title: '🛠️ Utilitas',
                  rows: [
                    { rowId: '.ping',     title: '🏓 Ping',     description: 'Cek status bot'         },
                    { rowId: '.info',     title: '📖 Info',     description: 'Info bot'                },
                    { rowId: '.button',   title: '🔘 Button',   description: 'Contoh button message'   },
                    { rowId: '.template', title: '🔗 Template', description: 'Contoh template message'  },
                  ],
                },
              ],
            }, { quoted: msg });
            break;

          case '.button':
            await sock.sendMessage(from, {
              text:    '🤔 Pilih salah satu:',
              footer:  'Fotk Library',
              header:  '⚡ Menu Cepat',
              buttons: [
                { buttonId: 'btn_ya',    displayText: '✅ Ya'        },
                { buttonId: 'btn_tidak', displayText: '❌ Tidak'     },
                { buttonId: 'btn_nanti', displayText: '🕐 Nanti Aja' },
              ],
            }, { quoted: msg });
            break;

          case '.template':
            await sock.sendMessage(from, {
              text:   'Kunjungi atau hubungi kami!',
              footer: 'Fotk Library',
              header: '📞 Kontak',
              templateButtons: [
                { type: 'url',        displayText: '🌐 Website', url: 'https://github.com'      },
                { type: 'call',       displayText: '📞 Telepon', phoneNumber: '+6281234567890'  },
                { type: 'quickReply', displayText: '✅ Oke',     id: 'ok_confirm'               },
              ],
            }, { quoted: msg });
            break;

          case '.info':
            await sock.sendMessage(from, {
              text: [
                `📦 *Fotk Library v1.0.0*`,
                `🔌 WhatsApp Multi-Device`,
                `⏱️ Uptime: ${Math.floor(process.uptime())}s`,
                `🖥️ Node.js ${process.version}`,
              ].join('\n'),
            }, { quoted: msg });
            break;

          // Tangkap balasan button / list / template
          case 'btn_ya':
          case 'btn_tidak':
          case 'btn_nanti':
          case 'ok_confirm':
            await sock.sendMessage(from, {
              text: `✅ Kamu pilih: *${body}*`,
            }, { quoted: msg });
            break;

          default:
            if (cmd.startsWith('.')) {
              await sock.sendMessage(from, {
                text: `❓ Command *${cmd}* tidak dikenali. Ketik *.menu*`,
              }, { quoted: msg });
            }
        }
      } catch (err) {
        logger.error(`Error cmd "${cmd}": ${err.message}`);
      }
    }
  });

  // ── GROUP EVENTS ────────────────────────────────────────────────────────────
  sock.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      const names = participants.map((p) => `@${p.split('@')[0]}`).join(', ');
      const text  = action === 'add'
        ? `👋 Selamat datang ${names}!`
        : `👋 ${names} telah keluar.`;
      await sock.sendMessage(id, { text, mentions: participants });
    } catch {}
  });

  return sock;
}

// ── ENTRY POINT ──────────────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('Fatal error saat start:', err.message);
  process.exit(1);
});
