'use strict';

const { generateMessageID } = require('../Utils');
const { jidGroup } = require('../Types');

/**
 * GroupSocket
 * ───────────
 * Mixin/helper that adds group-management methods to the main WASocket.
 * In practice you'd call these via `sock.groupXxx(...)`.
 */

/**
 * Build an IQ stanza for group operations.
 * @param {string} type    'create' | 'add' | 'remove' | 'promote' | 'demote' | 'leave'
 * @param {string} jid     Group JID
 * @param {string[]} participants
 * @param {object} extra   Additional attributes
 */
function buildGroupIQ(type, jid, participants = [], extra = {}) {
  const participantNodes = participants.map((p) => ['participant', { jid: p }, null]);
  return [
    'iq',
    {
      id:    generateMessageID(),
      type:  'set',
      xmlns: 'w:g2',
      to:    jid || 'g.us',
      ...extra,
    },
    [
      [type, {}, participantNodes.length ? participantNodes : null],
    ],
  ];
}

/**
 * Build group metadata request stanza.
 * @param {string} jid  Group JID
 */
function buildGroupMetadataQuery(jid) {
  return [
    'iq',
    {
      id:    generateMessageID(),
      type:  'get',
      xmlns: 'w:g2',
      to:    jid,
    },
    [['query', { request: 'interactive' }, null]],
  ];
}

/**
 * Parse group metadata from a server IQ response.
 * @param {Array} iqNode  Decoded binary node
 * @returns {object}
 */
function parseGroupMetadata(iqNode) {
  if (!iqNode) return null;
  const [, attrs, children] = iqNode;
  const groupNode = Array.isArray(children) ? children.find((c) => c?.[0] === 'group') : null;
  if (!groupNode) return null;

  const [, gAttrs, gChildren] = groupNode;
  const participants = [];

  if (Array.isArray(gChildren)) {
    for (const child of gChildren) {
      if (!child) continue;
      const [childTag, childAttrs] = child;
      if (childTag === 'participant') {
        participants.push({
          jid:   childAttrs?.jid  || '',
          isAdmin: childAttrs?.type === 'admin' || childAttrs?.type === 'superadmin',
          isSuperAdmin: childAttrs?.type === 'superadmin',
        });
      }
    }
  }

  return {
    id:           gAttrs?.id      || attrs?.from || '',
    subject:      gAttrs?.subject || '',
    creation:     parseInt(gAttrs?.creation || '0', 10),
    owner:        gAttrs?.creator || '',
    participants,
    desc:         gAttrs?.desc    || '',
    announce:     gAttrs?.announce === 'true',
    restrict:     gAttrs?.restrict === 'true',
    size:         participants.length,
  };
}

/**
 * Build a group creation IQ stanza.
 * @param {string}   subject      Group name
 * @param {string[]} participants  Initial member JIDs (excluding self)
 */
function buildCreateGroupIQ(subject, participants) {
  const participantNodes = participants.map((p) => ['participant', { jid: p }, null]);
  return [
    'iq',
    {
      id:    generateMessageID(),
      type:  'set',
      xmlns: 'w:g2',
      to:    'g.us',
    },
    [
      ['create', { subject, key: generateMessageID() }, participantNodes],
    ],
  ];
}

/**
 * Build a "leave group" IQ stanza.
 * @param {string[]} groupJids  Groups to leave
 */
function buildLeaveGroupIQ(groupJids) {
  const groupNodes = groupJids.map((jid) => ['group', { id: jid }, null]);
  return [
    'iq',
    {
      id:    generateMessageID(),
      type:  'set',
      xmlns: 'w:g2',
      to:    'g.us',
    },
    [['leave', {}, groupNodes]],
  ];
}

/**
 * Build a group invite link fetch IQ.
 * @param {string} jid  Group JID
 */
function buildGroupInviteLinkIQ(jid) {
  return [
    'iq',
    {
      id:    generateMessageID(),
      type:  'get',
      xmlns: 'w:g2',
      to:    jid,
    },
    [['invite', {}, null]],
  ];
}

/**
 * Build an update-description IQ stanza.
 * @param {string} jid   Group JID
 * @param {string} desc  New description
 */
function buildGroupDescriptionIQ(jid, desc) {
  return [
    'iq',
    {
      id:    generateMessageID(),
      type:  'set',
      xmlns: 'w:g2',
      to:    jid,
    },
    [['description', {}, [['body', {}, desc]]]],
  ];
}

module.exports = {
  buildGroupIQ,
  buildGroupMetadataQuery,
  parseGroupMetadata,
  buildCreateGroupIQ,
  buildLeaveGroupIQ,
  buildGroupInviteLinkIQ,
  buildGroupDescriptionIQ,
};
