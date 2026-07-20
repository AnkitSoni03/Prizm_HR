'use strict';

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoBase64URL, isoUint8Array } = require('@simplewebauthn/server/helpers');

// Dev/local defaults — a real deployment must set these to the actual
// frontend domain (WEBAUTHN_RP_ID has no scheme/port, WEBAUTHN_ORIGIN does).
const RP_NAME = 'HRMS';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';

function generateDeviceRegistrationOptions({ employeeId, employeeCode, excludeCredentialIds = [] }) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: employeeCode,
    userID: isoUint8Array.fromUTF8String(String(employeeId)),
    attestationType: 'none',
    excludeCredentials: excludeCredentialIds.map((id) => ({ id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
}

async function verifyDeviceRegistration({ response, expectedChallenge }) {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });

  if (!result.verified) return null;

  const { credential } = result.registrationInfo;
  return {
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
  };
}

function generateAssertionOptions({ allowCredentialIds = [] }) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: allowCredentialIds.map((id) => ({ id })),
    userVerification: 'required',
  });
}

// storedCounter is passed in as 0 here deliberately — the library itself
// throws a generic Error if it sees counter <= credential.counter, which
// would surface as an opaque 500 instead of a clean rejection. The actual
// strictly-greater check (and the reject-vs-accept decision) is done by the
// caller against employee_devices.signature_counter, using the newCounter
// this returns.
async function verifyDeviceAssertion({ response, expectedChallenge, credentialId, publicKey }) {
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
    credential: {
      id: credentialId,
      publicKey: isoBase64URL.toBuffer(publicKey),
      counter: 0,
    },
  });

  return { verified: result.verified, newCounter: result.verified ? result.authenticationInfo.newCounter : null };
}

module.exports = {
  generateDeviceRegistrationOptions,
  verifyDeviceRegistration,
  generateAssertionOptions,
  verifyDeviceAssertion,
};
