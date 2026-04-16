'use strict';

const { useMultiFileAuthState } = require('./useMultiFileAuthState');
const { generateRegistrationNode, generatePreKeys } = require('./registration');

module.exports = {
  useMultiFileAuthState,
  generateRegistrationNode,
  generatePreKeys,
};
