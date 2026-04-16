'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  WA BINARY STANZA CODEC
//  Reverse-engineered WA Web binary protocol for encoding/decoding XML-like
//  stanza trees as compact binary frames.
// ─────────────────────────────────────────────────────────────────────────────

const TAGS = {
  LIST_EMPTY:   0,  STREAM_END:  2,
  DICTIONARY_0: 236, DICTIONARY_1: 237, DICTIONARY_2: 238, DICTIONARY_3: 239,
  LIST_8: 248, LIST_16: 249, JID_PAIR: 250, HEX_8: 251,
  BINARY_8: 252, BINARY_20: 253, BINARY_32: 254, NIBBLE_8: 255,
};

// WA single-byte token table (positions 3–N map to string constants)
const TOKENS = [
  null,null,null,'200','400','404','500','501','502','action','add','after',
  'archive','author','available','battery','before','body','broadcast','chat',
  'clear','code','composing','contacts','count','create','debug','delete','demote',
  'duplicate','encoding','error','false','filehash','from','g.us','group',
  'groups_v2','height','id','image','in','index','invis','item','jid','kind',
  'last','leave','live','log','media','message','minutes','miss','modify','name',
  'notification','notify','out','owner','participant','paused','picture','played',
  'presence','preview','promote','query','raw','read','receipt','received',
  'recipient','recording','relay','remove','response','resume','retry',
  's.whatsapp.net','seconds','set','size','status','subject','subscribe',
  'success','t','text','to','true','type','unarchive','unavailable','url',
  'user','value','web','width','zoom','</w:profile:picture>','<w:profile:picture>',
  'audio','cache','call','call-id','call-creator','category','chat-state',
  'ciphertext','col','conversation','device','device-identity','disappearing_mode',
  'duration','enc','encrypt','expiration','identity','input','loc','location',
  'mime-type','ms','msg','noise_info','off','on','open','oob','package',
  'plaintext','platform','product','profile','proto','registration','retry',
  'seen','sender','signal_identities','silent','sm','stanza-id','supplementary',
  'thumbnail','ts','urn:xmpp:whatsapp:dirty','urn:xmpp:whatsapp:push',
  'verified_name','video','vname','voip','width',
];

const NIBBLE_MAP = ['0','1','2','3','4','5','6','7','8','9','-','.','','','',''];
const HEX_MAP    = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F'];

// ─── READER ──────────────────────────────────────────────────────────────────

class BinaryReader {
  constructor(data) { this.data = data; this.i = 0; }

  readByte() {
    if (this.i >= this.data.length) throw new Error('BinaryReader: EOF');
    return this.data[this.i++];
  }

  readBytes(n) { const s = this.data.slice(this.i, this.i + n); this.i += n; return s; }

  readInt(n, le = false) {
    let v = 0;
    for (let j = 0; j < n; j++) {
      const b = this.readByte();
      v = le ? (v | (b << (j * 8))) : ((v << 8) | b);
    }
    return v;
  }

  readString(tag) {
    if (tag >= 3 && tag < TOKENS.length) {
      const t = TOKENS[tag];
      if (t == null) throw new Error(`Bad token: ${tag}`);
      return t;
    }
    switch (tag) {
      case TAGS.DICTIONARY_0: case TAGS.DICTIONARY_1:
      case TAGS.DICTIONARY_2: case TAGS.DICTIONARY_3:
        this.readByte(); return `dict_${tag - TAGS.DICTIONARY_0}`;
      case TAGS.LIST_EMPTY:  return null;
      case TAGS.BINARY_8:    return this.readBytes(this.readByte()).toString('utf-8');
      case TAGS.BINARY_20:   return this.readBytes((this.readByte() << 16) | this.readInt(2)).toString('utf-8');
      case TAGS.BINARY_32:   return this.readBytes(this.readInt(4)).toString('utf-8');
      case TAGS.NIBBLE_8:    return this._readPacked(true);
      case TAGS.HEX_8:       return this._readPacked(false);
      default: throw new Error(`Unknown string tag: ${tag}`);
    }
  }

  _readPacked(isNibble) {
    const start = this.readByte();
    const count = start & 0x7f;
    const hasPad = !!(start & 0x80);
    let result = '';
    const map = isNibble ? NIBBLE_MAP : HEX_MAP;
    for (let j = 0; j < count; j++) {
      const b = this.readByte();
      result += map[(b >> 4) & 0x0f];
      if (j < count - 1 || !hasPad) result += map[b & 0x0f];
    }
    return result;
  }

  _listSize(tag) {
    if (tag === TAGS.LIST_EMPTY) return 0;
    if (tag === TAGS.LIST_8)     return this.readByte();
    if (tag === TAGS.LIST_16)    return this.readInt(2);
    throw new Error(`Bad list tag: ${tag}`);
  }

  readNode() {
    const listSize = this._listSize(this.readByte());
    const descTag  = this.readByte();
    if (descTag === TAGS.STREAM_END) return null;
    const desc  = this.readString(descTag);
    const attrs = {};
    const attrCount = Math.floor((listSize - 1) / 2);
    for (let j = 0; j < attrCount; j++) {
      const k = this.readString(this.readByte());
      const v = this.readString(this.readByte());
      if (k) attrs[k] = v;
    }
    if (listSize % 2 === 0) return [desc, attrs, null];
    const ct = this.readByte();
    const isList = [TAGS.LIST_EMPTY, TAGS.LIST_8, TAGS.LIST_16].includes(ct);
    const children = isList ? this._readList(ct) : this.readString(ct);
    return [desc, attrs, children];
  }

  _readList(tag) {
    const size = this._listSize(tag);
    const out  = [];
    for (let j = 0; j < size; j++) out.push(this.readNode());
    return out;
  }
}

// ─── WRITER ──────────────────────────────────────────────────────────────────

class BinaryWriter {
  constructor() { this._buf = []; }

  pushByte(b)  { this._buf.push(b & 0xff); return this; }
  pushBytes(b) { for (const x of b) this._buf.push(x); return this; }

  pushInt(value, n, le = false) {
    for (let i = 0; i < n; i++) {
      const shift = le ? i * 8 : (n - 1 - i) * 8;
      this.pushByte((value >> shift) & 0xff);
    }
    return this;
  }

  writeString(str) {
    if (str == null) { this.pushByte(TAGS.LIST_EMPTY); return this; }
    const idx = TOKENS.indexOf(str);
    if (idx > 2) { this.pushByte(idx); return this; }
    const b = Buffer.from(str, 'utf-8');
    if (b.length < 256)          { this.pushByte(TAGS.BINARY_8); this.pushByte(b.length); }
    else if (b.length < 1 << 20) { this.pushByte(TAGS.BINARY_20); this.pushByte((b.length >> 16) & 0x0f); this.pushInt(b.length & 0xffff, 2); }
    else                          { this.pushByte(TAGS.BINARY_32); this.pushInt(b.length, 4); }
    this.pushBytes(b);
    return this;
  }

  _listSize(n) {
    if (n === 0)    this.pushByte(TAGS.LIST_EMPTY);
    else if (n < 256) { this.pushByte(TAGS.LIST_8);  this.pushByte(n); }
    else              { this.pushByte(TAGS.LIST_16); this.pushInt(n, 2); }
  }

  writeNode(node) {
    if (!node) return this;
    const [tag, attrs, content] = node;
    const ac  = attrs   ? Object.keys(attrs).length : 0;
    const has = content != null;
    this._listSize(1 + 2 * ac + (has ? 1 : 0));
    this.writeString(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) { this.writeString(k); this.writeString(v); }
    if (has) {
      if (Array.isArray(content)) { this._listSize(content.length); for (const c of content) this.writeNode(c); }
      else this.writeString(content);
    }
    return this;
  }

  toBuffer() { return Buffer.from(this._buf); }
}

function decodeBinaryNode(data) { return new BinaryReader(data).readNode(); }
function encodeBinaryNode(node) { return new BinaryWriter().writeNode(node).toBuffer(); }

module.exports = { decodeBinaryNode, encodeBinaryNode, BinaryReader, BinaryWriter, TAGS };
