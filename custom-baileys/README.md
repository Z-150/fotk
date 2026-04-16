# custom-baileys

> Custom WhatsApp Multi-Device Bot Library — built from scratch, architecturally compatible with `@whiskeysockets/baileys`.

---

## ✨ Fitur

| Fitur | Status |
|---|---|
| WebSocket WA Multi-Device | ✅ |
| QR Code login | ✅ |
| Multi-file auth state | ✅ |
| Kirim pesan teks | ✅ |
| Kirim gambar / video / audio | ✅ |
| Kirim dokumen / stiker | ✅ |
| **Button Message (patched)** | ✅ |
| **List Message (patched)** | ✅ |
| **Template Message — URL & Call (patched)** | ✅ |
| Reaction message | ✅ |
| Location message | ✅ |
| Manajemen grup | ✅ |
| Auto-reconnect | ✅ |
| Presence update | ✅ |
| Read receipt | ✅ |

---

## 📦 Instalasi

```bash
npm install
```

> Node.js **≥ 18** diperlukan.

---

## 🚀 Quick Start

```js
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('custom-baileys');

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    saveCreds,
    printQRInTerminal: true,
  });

  sock.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (connection === 'open') console.log('✅ Bot terhubung!');
    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) start();
    }
  });

  sock.on('creds.update', saveCreds);

  sock.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg  = messages[0];
    const from = msg.key.remoteJid;
    const body = msg.message?.conversation || '';
    console.log('Pesan:', body);
    await sock.sendMessage(from, { text: 'Halo!' }, { quoted: msg });
  });
}

start();
```

---

## 📨 Mengirim Pesan

### Teks biasa

```js
await sock.sendMessage(jid, { text: 'Halo Dunia!' });
```

### Dengan reply (quoted)

```js
await sock.sendMessage(jid, { text: 'Ini balasan!' }, { quoted: msg });
```

### Mention

```js
await sock.sendMessage(jid, {
  text: '@628123456789 Halo!',
}, {
  mentions: ['628123456789@s.whatsapp.net'],
});
```

---

## 🔘 Button Message ★

```js
await sock.sendMessage(jid, {
  text:    'Pilih salah satu opsi:',
  footer:  '🤖 custom-baileys',
  header:  'Menu Utama',
  buttons: [
    { buttonId: 'btn_1', displayText: '✅ Ya, Lanjutkan' },
    { buttonId: 'btn_2', displayText: '❌ Tidak, Batal' },
    { buttonId: 'btn_3', displayText: '🔄 Nanti Saja' },
  ],
}, { quoted: msg });
```

**Menangkap balasan button:**

```js
sock.on('messages.upsert', async ({ messages }) => {
  const msg  = messages[0];
  const body = msg.message?.buttonsResponseMessage?.selectedButtonId;
  if (body === 'btn_1') {
    await sock.sendMessage(msg.key.remoteJid, { text: 'Kamu memilih Ya!' });
  }
});
```

---

## 📋 List Message ★

```js
await sock.sendMessage(jid, {
  title:      'Pilih Menu',
  text:       'Silakan pilih salah satu menu di bawah ini:',
  footer:     '🤖 Powered by custom-baileys',
  buttonText: '📋 Buka Daftar Menu',
  sections: [
    {
      title: '🛠️ Utilitas',
      rows: [
        { rowId: 'ping',  title: '🏓 Ping',  description: 'Cek status bot' },
        { rowId: 'info',  title: '📖 Info',  description: 'Info bot' },
        { rowId: 'help',  title: '❓ Help',  description: 'Bantuan penggunaan' },
      ],
    },
    {
      title: '🎵 Downloader',
      rows: [
        { rowId: 'tiktok', title: '🎵 TikTok',    description: 'Download video TikTok' },
        { rowId: 'ytmp3',  title: '🎧 YouTube MP3', description: 'Download audio YouTube' },
        { rowId: 'ytmp4',  title: '🎬 YouTube MP4', description: 'Download video YouTube' },
      ],
    },
  ],
}, { quoted: msg });
```

**Menangkap balasan list:**

```js
const selectedRowId = msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
if (selectedRowId === 'ping') { /* handle ping */ }
```

---

## 🔗 Template Message ★

Template message mendukung tombol URL, tombol Call, dan Quick Reply.

```js
await sock.sendMessage(jid, {
  text:   'Hubungi atau kunjungi kami sekarang!',
  footer: '🤖 custom-baileys',
  header: '📞 Informasi Kontak',
  templateButtons: [
    {
      type:        'url',
      displayText: '🌐 Kunjungi Website',
      url:         'https://example.com',
    },
    {
      type:        'call',
      displayText: '📞 Telepon Kami',
      phoneNumber: '+6281234567890',
    },
    {
      type:        'quickReply',
      displayText: '✅ Saya Tertarik',
      id:          'interested',
    },
  ],
}, { quoted: msg });
```

**Menangkap balasan template:**

```js
const selectedId = msg.message?.templateButtonReplyMessage?.selectedId;
if (selectedId === 'interested') { /* handle */ }
```

---

## 🖼️ Media

### Gambar

```js
// Dari file lokal
await sock.sendMessage(jid, {
  image:   './foto.jpg',
  caption: 'Ini gambar dari file lokal',
});

// Dari URL
await sock.sendMessage(jid, {
  image:   'https://example.com/foto.jpg',
  caption: 'Ini gambar dari URL',
});

// Dari Buffer
const buf = require('fs').readFileSync('./foto.jpg');
await sock.sendMessage(jid, { image: buf, caption: 'Buffer image' });
```

### Video

```js
await sock.sendMessage(jid, {
  video:   './video.mp4',
  caption: 'Video keren!',
});
```

### Audio / Voice Note

```js
await sock.sendMessage(jid, {
  audio: './audio.ogg',
  ptt:   true, // Voice note (push-to-talk)
});
```

### Dokumen

```js
await sock.sendMessage(jid, {
  document: './laporan.pdf',
  mimetype: 'application/pdf',
  fileName: 'Laporan Q3 2024.pdf',
});
```

### Stiker

```js
await sock.sendMessage(jid, {
  sticker: './stiker.webp',
});
```

---

## 👥 Manajemen Grup

```js
// Metadata grup
const meta = await sock.groupMetadata('1234567890@g.us');
console.log(meta.subject, meta.participants);

// Buat grup
await sock.groupCreate('Nama Grup', [
  '628111111111@s.whatsapp.net',
  '628222222222@s.whatsapp.net',
]);

// Tambah/hapus/promosi/demosi peserta
await sock.groupParticipantsUpdate('1234567890@g.us', ['628xxx@s.whatsapp.net'], 'add');
await sock.groupParticipantsUpdate('1234567890@g.us', ['628xxx@s.whatsapp.net'], 'remove');
await sock.groupParticipantsUpdate('1234567890@g.us', ['628xxx@s.whatsapp.net'], 'promote');
await sock.groupParticipantsUpdate('1234567890@g.us', ['628xxx@s.whatsapp.net'], 'demote');

// Keluar dari grup
await sock.groupLeave('1234567890@g.us');

// Ubah deskripsi grup
await sock.groupUpdateDescription('1234567890@g.us', 'Deskripsi baru');

// Ubah nama grup
await sock.groupUpdateSubject('1234567890@g.us', 'Nama Baru');

// Dapatkan invite link
const code = await sock.groupInviteCode('1234567890@g.us');
console.log(`https://chat.whatsapp.com/${code}`);
```

---

## 🧩 Struktur Project

```
custom-baileys/
├── index.js               ← Entry point (semua export)
├── package.json
├── README.md
├── src/
│   ├── Socket/
│   │   ├── index.js       ← WASocket class + makeWASocket()
│   │   ├── noise.js       ← Noise protocol (WA MD handshake)
│   │   ├── binary.js      ← Binary stanza encode/decode
│   │   └── groups.js      ← Group IQ stanza builders
│   ├── Auth/
│   │   ├── index.js
│   │   ├── useMultiFileAuthState.js  ← Session persistence
│   │   └── registration.js           ← Key generation
│   ├── Message/
│   │   ├── index.js
│   │   ├── builder.js     ← buildButtonMessage ★ buildListMessage ★ buildTemplateMessage ★
│   │   └── media.js       ← Media upload/download helpers
│   ├── Types/
│   │   └── index.js       ← Constants, enums, JID helpers
│   └── Utils/
│       └── index.js       ← Crypto, ID gen, sleep, backoff
└── example/
    └── bot.js             ← Contoh bot lengkap
```

---

## ⚙️ Konfigurasi makeWASocket

| Parameter | Default | Keterangan |
|---|---|---|
| `auth` | (wajib) | Auth state dari `useMultiFileAuthState` |
| `saveCreds` | (wajib) | Callback untuk menyimpan credentials |
| `logger` | null logger | Objek logger (pino-compatible) |
| `printQRInTerminal` | `true` | Print QR ke stdout |
| `markOnlineOnConnect` | `false` | Kirim presence 'available' saat connect |
| `connectTimeoutMs` | `20000` | Timeout koneksi (ms) |
| `defaultQueryTimeoutMs` | `60000` | Timeout query IQ (ms) |

---

## 📝 Catatan Teknis

- **Signal Encryption**: Stub implementasi — untuk production, integrasikan `libsignal` untuk enkripsi end-to-end yang sesungguhnya.
- **Media CDN**: Download media dari CDN WA memerlukan implementasi `mediaKey` decryption (AES-256-CBC + HMAC-SHA256).
- **QR Code**: QR yang dihasilkan adalah struktural demo. Untuk QR yang bisa di-scan, diperlukan `ref` dari server WA dan signing dengan identity key.
- **Button/List/Template**: Protobuf telah di-patch sedemikian rupa agar compatible dengan klien WA MD. Render interaktif bergantung pada versi WA klien pengguna.

---

## 📄 Lisensi

MIT © custom-baileys contributors
