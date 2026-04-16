'use strict';

const baileys = require('../../vendor/wa-engine');
const useBaileysMultiFileAuthState =
  baileys.useMultiFileAuthState || baileys.default?.useMultiFileAuthState;

if (typeof useBaileysMultiFileAuthState !== 'function') {
  throw new Error('Failed to load useMultiFileAuthState from internal WA engine');
}

async function useMultiFileAuthState(folder) {
  return useBaileysMultiFileAuthState(folder);
}

module.exports = { useMultiFileAuthState };
