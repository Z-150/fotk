# fotk

Custom WhatsApp Multi-Device library built for your own project and portfolio, with a Baileys-compatible API style.

## Positioning

- This project is your own library implementation.
- `Z-150/baileys` can be used as inspiration/reference for API patterns.
- Keep attribution clear in your repository description and documentation.

## Install

```bash
npm install
```

## Quick start

```js
const { makeWASocket, useMultiFileAuthState, fetchLatestWaWebVersion } = require('fotk');

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  const version = await fetchLatestWaWebVersion();

  const sock = makeWASocket({
    auth: state,
    saveCreds,
    version,
    whatsappWebMd: true,
    printQRInTerminal: true,
  });

  sock.on('connection.update', ({ connection }) => {
    if (connection === 'open') console.log('connected');
  });
}

start();
```

## Local development

```bash
npm run check
npm run start
```

## Publish to your public repo (portfolio)

1. Create a GitHub repository under your account.
2. Push this codebase to that repository.
3. Update `package.json` fields (`name`, `author`, and optional `repository` metadata) with your identity.
4. Keep this project README as your portfolio proof of work and architecture choices.

## License

MIT
