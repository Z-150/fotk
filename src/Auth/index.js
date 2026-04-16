'use strict';
const { useMultiFileAuthState }                                         = require('./useMultiFileAuthState');
const { generateRegistrationNode, generateCurve25519KeyPair, generatePreKeys } = require('./registration');
module.exports = { useMultiFileAuthState, generateRegistrationNode, generateCurve25519KeyPair, generatePreKeys };
