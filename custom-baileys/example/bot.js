'use strict';

/**
 * example/bot.js
 * ──────────────
 * Contoh bot menggunakan custom-baileys.
 *
 * Jalankan: node example/bot.js
 */

const path = require('path');
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  isJidGroup,
} = require('../index');

const logger = {
  info:  (...a) => console.log('[INFO]',  ...a),
  warn:  (...a) => console.warn('[WARN]',  ...a),
  error: (...a) => console.error('[ERROR]', ...a),
  debug: () => {},
  trace: () => {},
};

// ─────────────────────────────────────────────
//  SINGLE SOCKET INSTANCE — no recursive startBot()
// ─────────────────────────────────────────────

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, '../auth_info_baileys')
  );

  // makeWASocket handles reconnect internally.
  // Do NOT call startBot() recursively on close — that causes exponential spawn.
  const sock = makeWASocket({
    auth:                state,
    saveCreds,
    logger,
    printQRInTerminal:   true,
    markOnlineOnConnect: true,
  });

  sock.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) console.log('\n📱 Scan QR code di atas dengan WhatsApp kamu!\n');

    if (connection === 'open') {
      console.log('✅ Bot terhubung ke WhatsApp!');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut  = statusCode === DisconnectReason.loggedOut;
      console.log(`❌ Koneksi terputus (${statusCode}).`);

      if (loggedOut) {
        // Socket sudah destroy dirinya sendiri — kita hanya log
        console.log('🚫 Sesi expired. Hapus folder auth_info_baileys dan restart.');
        process.exit(0);
      }
      // Untuk alasan lain: socket sudah auto-reconnect secara internal
      console.log('🔄 Bot sedang mencoba reconnect secara otomatis...');
    }
  });

  sock.on('creds.update', saveCreds);

  // ── Message handler ────────────────────────────────────────────────────────

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
        '';

      const cmd = body?.trim().toLowerCase().split(' ')[0];
      console.log(`📨 [${pushName}] ${body}`);

      try {
        switch (cmd) {

          case '.ping':
            await sock.sendMessage(from, { text: '🏓 *Pong!*' }, { quoted: msg });
            break;

          case '.menu':
            await sock.sendMessage(from, {
              title:      '🤖 Bot Menu',
              text:       'Silakan pilih menu di bawah ini:',
              footer:     'custom-baileys v1.0.0',
              buttonText: '📋 Buka Menu',
              sections: [
                {
                  title: '🛠️ Utilitas',
                  rows: [
                    { rowId: '.ping',    title: '🏓 Ping',      description: 'Cek status bot'        },
                    { rowId: '.info',    title: '📖 Info',      description: 'Info bot'               },
                    { rowId: '.button',  title: '🔘 Button',    description: 'Contoh button message'  },
                    { rowId: '.template',title: '🔗 Template',  description: 'Contoh template message' },
                  ],
                },
              ],
            }, { quoted: msg });
            break;

          case '.button':
            await sock.sendMessage(from, {
              text:    '🤔 Pilih salah satu opsi:',
              footer:  'custom-baileys',
              header:  '⚡ Menu Cepat',
              buttons: [
                { buttonId: 'btn_ya',    displayText: '✅ Ya'       },
                { buttonId: 'btn_tidak', displayText: '❌ Tidak'    },
                { buttonId: 'btn_nanti', displayText: '🕐 Nanti Aja' },
              ],
            }, { quoted: msg });
            break;

          case '.template':
            await sock.sendMessage(from, {
              text:   'Kunjungi atau hubungi kami!',
              footer: 'custom-baileys',
              header: '📞 Kontak',
              templateButtons: [
                { type: 'url',        displayText: '🌐 Website',  url: 'https://github.com'     },
                { type: 'call',       displayText: '📞 Telepon',  phoneNumber: '+6281234567890' },
                { type: 'quickReply', displayText: '✅ Oke',      id: 'ok_confirm'              },
              ],
            }, { quoted: msg });
            break;

          case '.info':
            await sock.sendMessage(from, {
              text: `📦 *custom-baileys v1.0.0*\n🔌 WA Multi-Device\n⏱️ Uptime: ${Math.floor(process.uptime())}s`,
            }, { quoted: msg });
            break;

          // Tangkap balasan button/list/template
          case 'btn_ya':
          case 'btn_tidak':
          case 'btn_nanti':
          case 'ok_confirm':
            await sock.sendMessage(from, {
              text: `✅ Kamu memilih: *${body}*`,
            }, { quoted: msg });
            break;

          default:
            if (cmd?.startsWith('.')) {
              await sock.sendMessage(from, {
                text: `❓ Command *${cmd}* tidak dikenali. Ketik *.menu* untuk daftar perintah.`,
              }, { quoted: msg });
            }
        }
      } catch (err) {
        logger.error({ err }, `Error handling: ${cmd}`);
      }
    }
  });

  sock.on('group-participants.update', async ({ id, participants, action }) => {
    const text = action === 'add'
      ? `👋 Selamat datang ${participants.map(p => `@${p.split('@')[0]}`).join(', ')}!`
      : `👋 ${participants.map(p => `@${p.split('@')[0]}`).join(', ')} telah keluar.`;
    await sock.sendMessage(id, { text, mentions: participants });
  });

  return sock;
}

startBot().catch(console.error);
