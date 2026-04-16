'use strict';

// ─────────────────────────────────────────────
//  WA BINARY PROTOCOL — FRAME CODEC
// ─────────────────────────────────────────────
// WhatsApp uses a custom binary encoding (not raw protobuf) for stanzas.
// This module implements the core frame encode/decode used by the WebSocket layer.
//
// Reference: https://github.com/WhiskeySockets/Baileys (MIT)
//            Reverse-engineered from WA Web traffic analysis.

// ── Tag constants ────────────────────────────────────────────────────────────
const TAGS = {
  LIST_EMPTY:    0,
  STREAM_END:    2,
  DICTIONARY_0:  236,
  DICTIONARY_1:  237,
  DICTIONARY_2:  238,
  DICTIONARY_3:  239,
  LIST_8:        248,
  LIST_16:       249,
  JID_PAIR:      250,
  HEX_8:         251,
  BINARY_8:      252,
  BINARY_20:     253,
  BINARY_32:     254,
  NIBBLE_8:      255,
  SINGLE_BYTE_MAX: 256,
};

const WA_SINGLE_BYTE_TOKENS = [
  null,null,null,'200','400','404','500','501','502',
  'action','add','after','archive','author','available',
  'battery','before','body','broadcast','chat','clear',
  'code','composing','contacts','count','create','debug',
  'delete','demote','duplicate','encoding','error','false',
  'filehash','from','g.us','group','groups_v2','height',
  'id','image','in','index','invis','item','jid',
  'kind','last','leave','live','log','media','message',
  'minutes','miss','modify','name','notification','notify',
  'out','owner','participant','paused','picture','played',
  'presence','preview','promote','query','raw','read',
  'receipt','received','recipient','recording','relay',
  'remove','response','resume','retry','s.whatsapp.net',
  'seconds','set','size','status','subject','subscribe',
  'success','t','text','to','true','type','unarchive',
  'unavailable','url','user','value','web','width',
  'zoom','</w:profile:picture>','<w:profile:picture>',
  'audio','cache','call','call-id','call-creator',
  'category','chat-state','ciphertext','col','conversation',
  'device','device-identity','disappearing_mode',
  'duration','enc','encrypt','expiration','identity',
  'input','loc','location','mime-type','ms','msg',
  'noise_info','off','on','open','oob','package',
  'plaintext','platform','product','profile',
  'proto','registration','retry','seen','sender','signal_identities',
  'silent','sm','stanza-id','supplementary','thumbnail','ts',
  'urn:xmpp:whatsapp:dirty',
  'urn:xmpp:whatsapp:push',
  'verified_name', 'video','vname','voip','width',
];

// ─────────────────────────────────────────────
//  READER
// ─────────────────────────────────────────────

class BinaryReader {
  constructor(data) {
    this.data = data;
    this.index = 0;
  }

  readByte() {
    if (this.index >= this.data.length) throw new Error('BinaryReader: out of data');
    return this.data[this.index++];
  }

  readBytes(n) {
    const slice = this.data.slice(this.index, this.index + n);
    this.index += n;
    return slice;
  }

  readInt(n, littleEndian = false) {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const b = this.readByte();
      val = littleEndian
        ? val | (b << (i * 8))
        : (val << 8) | b;
    }
    return val;
  }

  readPacked8(tag) {
    const startByte = this.readByte();
    let value = '';
    const isNibble = tag === TAGS.NIBBLE_8;
    for (let i = 0; i < startByte & 0x7f; i++) {
      const b = this.readByte();
      const h = (b >> 4) & 0x0f;
      const l = b & 0x0f;
      value += isNibble ? NIBBLE_MAP[h] : HEX_MAP[h];
      if (i < (startByte & 0x7f) - 1 || !(startByte & 0x80)) {
        value += isNibble ? NIBBLE_MAP[l] : HEX_MAP[l];
      }
    }
    return value;
  }

  readString(tag) {
    if (tag >= 3 && tag <= WA_SINGLE_BYTE_TOKENS.length) {
      const t = WA_SINGLE_BYTE_TOKENS[tag];
      if (!t) throw new Error(`Invalid token: ${tag}`);
      return t;
    }
    switch (tag) {
      case TAGS.DICTIONARY_0:
      case TAGS.DICTIONARY_1:
      case TAGS.DICTIONARY_2:
      case TAGS.DICTIONARY_3:
        return this.readStringFromDictionary(tag - TAGS.DICTIONARY_0);
      case TAGS.LIST_EMPTY:  return null;
      case TAGS.BINARY_8:    return this.readBytes(this.readByte()).toString('utf-8');
      case TAGS.BINARY_20:   return this.readBytes((this.readByte() << 16) | this.readInt(2)).toString('utf-8');
      case TAGS.BINARY_32:   return this.readBytes(this.readInt(4)).toString('utf-8');
      case TAGS.NIBBLE_8:
      case TAGS.HEX_8:       return this.readPacked8(tag);
      default:
        throw new Error(`Unrecognised string tag: ${tag}`);
    }
  }

  readStringFromDictionary(idx) {
    const dictIdx = this.readByte();
    // Real WA uses server-provided dictionaries; return placeholder
    return `dict${idx}_${dictIdx}`;
  }

  readNode() {
    const listSize = this._readListSize(this.readByte());
    const descTag  = this.readByte();
    if (descTag === TAGS.STREAM_END) return null;
    const desc       = this.readString(descTag);
    const attrs      = this._readAttributes(listSize - 1);
    if (listSize % 2 === 0) return [desc, attrs, null];
    const childrenTag = this.readByte();
    const children    = this._isListTag(childrenTag)
      ? this.readList(childrenTag)
      : this.readString(childrenTag);
    return [desc, attrs, children];
  }

  _isListTag(tag) {
    return tag === TAGS.LIST_EMPTY || tag === TAGS.LIST_8 || tag === TAGS.LIST_16;
  }

  _readListSize(tag) {
    if (tag === TAGS.LIST_EMPTY) return 0;
    if (tag === TAGS.LIST_8)     return this.readByte();
    if (tag === TAGS.LIST_16)    return this.readInt(2);
    throw new Error(`Invalid list tag: ${tag}`);
  }

  readList(tag) {
    const size  = this._readListSize(tag);
    const items = [];
    for (let i = 0; i < size; i++) items.push(this.readNode());
    return items;
  }

  _readAttributes(n) {
    const attrs = {};
    for (let i = 0; i < n; i++) {
      const key   = this.readString(this.readByte());
      const val   = this.readString(this.readByte());
      attrs[key]  = val;
    }
    return attrs;
  }
}

const NIBBLE_MAP = ['0','1','2','3','4','5','6','7','8','9','-','.','','','',''];
const HEX_MAP    = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];

// ─────────────────────────────────────────────
//  WRITER
// ─────────────────────────────────────────────

class BinaryWriter {
  constructor() {
    this._data = [];
  }

  pushBytes(bytes) {
    for (const b of bytes) this._data.push(b);
    return this;
  }

  pushByte(b) {
    this._data.push(b & 0xff);
    return this;
  }

  pushInt(value, n, littleEndian = false) {
    for (let i = 0; i < n; i++) {
      const shift = littleEndian ? i * 8 : (n - 1 - i) * 8;
      this.pushByte((value >> shift) & 0xff);
    }
    return this;
  }

  writeString(str) {
    if (str === null || str === undefined) {
      this.pushByte(TAGS.LIST_EMPTY);
      return this;
    }
    const tokenIdx = WA_SINGLE_BYTE_TOKENS.indexOf(str);
    if (tokenIdx > 2) {
      this.pushByte(tokenIdx);
      return this;
    }
    const buf = Buffer.from(str, 'utf-8');
    if (buf.length < 256) {
      this.pushByte(TAGS.BINARY_8);
      this.pushByte(buf.length);
    } else if (buf.length < (1 << 20)) {
      this.pushByte(TAGS.BINARY_20);
      this.pushByte((buf.length >> 16) & 0x0f);
      this.pushInt(buf.length & 0xffff, 2);
    } else {
      this.pushByte(TAGS.BINARY_32);
      this.pushInt(buf.length, 4);
    }
    this.pushBytes(buf);
    return this;
  }

  writeNode(node) {
    if (!node) return this;
    const [tag, attrs, content] = node;
    const attrCount = attrs ? Object.keys(attrs).length : 0;
    const hasContent = content !== undefined && content !== null;
    const listSize  = 1 + 2 * attrCount + (hasContent ? 1 : 0);
    this._writeListSize(listSize);
    this.writeString(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        this.writeString(k);
        this.writeString(v);
      }
    }
    if (hasContent) {
      if (Array.isArray(content)) {
        this._writeListSize(content.length);
        for (const child of content) this.writeNode(child);
      } else {
        this.writeString(content);
      }
    }
    return this;
  }

  _writeListSize(size) {
    if (size === 0) {
      this.pushByte(TAGS.LIST_EMPTY);
    } else if (size < 256) {
      this.pushByte(TAGS.LIST_8);
      this.pushByte(size);
    } else {
      this.pushByte(TAGS.LIST_16);
      this.pushInt(size, 2);
    }
  }

  toBuffer() {
    return Buffer.from(this._data);
  }
}

// ─────────────────────────────────────────────
//  PUBLIC HELPERS
// ─────────────────────────────────────────────

/**
 * Decode a raw binary stanza Buffer into a node tuple [tag, attrs, children].
 * @param {Buffer} data
 */
function decodeBinaryNode(data) {
  const reader = new BinaryReader(data);
  return reader.readNode();
}

/**
 * Encode a node tuple into a binary stanza Buffer.
 * @param {Array} node  [tag, attrs, children]
 */
function encodeBinaryNode(node) {
  const writer = new BinaryWriter();
  writer.writeNode(node);
  return writer.toBuffer();
}

module.exports = { decodeBinaryNode, encodeBinaryNode, BinaryReader, BinaryWriter, TAGS };
