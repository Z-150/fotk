'use strict';

const { generateMessageID } = require('../Utils');

function buildGroupIQ(action, jid, participants = []) {
  const pNodes = participants.map((p) => ['participant', { jid: p }, null]);
  return ['iq', { id: generateMessageID(), type: 'set', xmlns: 'w:g2', to: jid || 'g.us' },
    [[action, {}, pNodes.length ? pNodes : null]]];
}

function buildGroupMetadataQuery(jid) {
  return ['iq', { id: generateMessageID(), type: 'get', xmlns: 'w:g2', to: jid },
    [['query', { request: 'interactive' }, null]]];
}

function parseGroupMetadata(iqNode) {
  if (!iqNode) return null;
  const [, attrs, children] = iqNode;
  const gNode = Array.isArray(children) ? children.find((c) => c?.[0] === 'group') : null;
  if (!gNode) return null;
  const [, ga, gc] = gNode;
  const participants = [];
  if (Array.isArray(gc)) {
    for (const c of gc) {
      if (c?.[0] === 'participant') {
        participants.push({
          jid:          c[1]?.jid || '',
          isAdmin:      ['admin', 'superadmin'].includes(c[1]?.type),
          isSuperAdmin: c[1]?.type === 'superadmin',
        });
      }
    }
  }
  return {
    id:           ga?.id      || attrs?.from || '',
    subject:      ga?.subject || '',
    creation:     parseInt(ga?.creation || '0', 10),
    owner:        ga?.creator || '',
    participants,
    announce:     ga?.announce === 'true',
    restrict:     ga?.restrict === 'true',
    size:         participants.length,
  };
}

function buildCreateGroupIQ(subject, participants) {
  const pNodes = participants.map((p) => ['participant', { jid: p }, null]);
  return ['iq', { id: generateMessageID(), type: 'set', xmlns: 'w:g2', to: 'g.us' },
    [['create', { subject, key: generateMessageID() }, pNodes]]];
}

function buildLeaveGroupIQ(groupJids) {
  return ['iq', { id: generateMessageID(), type: 'set', xmlns: 'w:g2', to: 'g.us' },
    [['leave', {}, groupJids.map((jid) => ['group', { id: jid }, null])]]];
}

function buildGroupInviteLinkIQ(jid) {
  return ['iq', { id: generateMessageID(), type: 'get', xmlns: 'w:g2', to: jid },
    [['invite', {}, null]]];
}

function buildGroupDescriptionIQ(jid, desc) {
  return ['iq', { id: generateMessageID(), type: 'set', xmlns: 'w:g2', to: jid },
    [['description', {}, [['body', {}, desc]]]]];
}

module.exports = {
  buildGroupIQ, buildGroupMetadataQuery, parseGroupMetadata,
  buildCreateGroupIQ, buildLeaveGroupIQ, buildGroupInviteLinkIQ, buildGroupDescriptionIQ,
};
