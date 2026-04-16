'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * useMultiFileAuthState
 * ─────────────────────
 * Persists each credential key as a separate JSON file inside `folder`.
 * Mirrors the Baileys multi-file auth state API so bot code is interchangeable.
 *
 * @param {string} folder  Directory where credential files are stored.
 * @returns {{ state: AuthState, saveCreds: () => Promise<void> }}
 */
async function useMultiFileAuthState(folder) {
  // Ensure directory exists
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  /**
   * Read a JSON file from the auth folder.
   * Returns `undefined` if the file does not exist or is corrupt.
   */
  function readFile(fileName) {
    const filePath = path.join(folder, fileName);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw, (key, value) => {
        // Restore Buffers that were serialised as { type:'Buffer', data:[...] }
        if (value && typeof value === 'object' && value.type === 'Buffer') {
          return Buffer.from(value.data);
        }
        return value;
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Write a JSON file to the auth folder.
   */
  function writeFile(fileName, data) {
    const filePath = path.join(folder, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, bufferReplacer, 2), 'utf-8');
  }

  /**
   * JSON replacer that serialises Buffers in a round-trippable format.
   */
  function bufferReplacer(_key, value) {
    if (Buffer.isBuffer(value)) {
      return { type: 'Buffer', data: Array.from(value) };
    }
    return value;
  }

  // ── Load or initialise the main credentials object ──────────────────────────

  let creds = readFile('creds.json');

  if (!creds) {
    const { generateRegistrationNode } = require('./registration');
    creds = generateRegistrationNode();
    writeFile('creds.json', creds);
  }

  // ── Key store — each key lives in its own file ───────────────────────────────

  const keys = {};

  /**
   * Load a key from disk into the in-memory `keys` cache.
   */
  function loadKey(type, id) {
    const fileName = `${type}-${id}.json`;
    const val = readFile(fileName);
    if (!keys[type]) keys[type] = {};
    if (val !== undefined) keys[type][id] = val;
    return val;
  }

  const state = {
    creds,

    keys: {
      /**
       * get(type, ids) → { [id]: key }
       * Returns only the keys that exist in the store.
       */
      get(type, ids) {
        const result = {};
        for (const id of ids) {
          const cached = keys[type]?.[id];
          if (cached !== undefined) {
            result[id] = cached;
          } else {
            const fromDisk = loadKey(type, id);
            if (fromDisk !== undefined) result[id] = fromDisk;
          }
        }
        return result;
      },

      /**
       * set(data) — data is { [type]: { [id]: value } }
       * Persists each key to its own file.
       */
      set(data) {
        for (const [type, ids] of Object.entries(data)) {
          if (!keys[type]) keys[type] = {};
          for (const [id, value] of Object.entries(ids)) {
            if (value) {
              keys[type][id] = value;
              writeFile(`${type}-${id}.json`, value);
            } else {
              // null / undefined → delete the key
              delete keys?.[type]?.[id];
              const filePath = path.join(folder, `${type}-${id}.json`);
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
          }
        }
      },
    },
  };

  /**
   * Persist the main credentials object back to disk.
   * Call this inside `connection.update` whenever `update.creds` changes.
   */
  async function saveCreds() {
    writeFile('creds.json', state.creds);
  }

  return { state, saveCreds };
}

module.exports = { useMultiFileAuthState };
