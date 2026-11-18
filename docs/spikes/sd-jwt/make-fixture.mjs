/**
 * Creates fixture.json for the Expo phone test:
 *   - an RS256-signed Employment SD-JWT credential (issued here on Node)
 *   - a TEST-ONLY holder secret key the phone uses for key binding
 *   - the issuer's public JWK (so verify-presentation.mjs can check RS256)
 *   - a nonce + audience the phone must bind its presentation to
 *
 * Run: node make-fixture.mjs   → writes fixture.json (copy it into the Expo project)
 * The keys in this fixture are throwaway test keys – never reuse them.
 */
import { generateKeyPairSync, createSign, getRandomValues } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { SdJwtInstance, uint8ArrayToBase64Url } from '@sd-jwt/core';
import { hasher, createHolderKey } from './holder-purejs.mjs';

const randomBytes = (n) => getRandomValues(new Uint8Array(n));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const holder = createHolderKey(randomBytes);

const issuer = new SdJwtInstance({
  signer: (data) => {
    const s = createSign('RSA-SHA256');
    s.update(data);
    return uint8ArrayToBase64Url(new Uint8Array(s.sign(privateKey)));
  },
  signAlg: 'RS256',
  hasher,
  hashAlg: 'sha-256',
  saltGenerator: (len) => uint8ArrayToBase64Url(randomBytes(len)),
});

const now = Math.floor(Date.now() / 1000);
const subject = {
  employee_id: 'STC-00001',
  full_name: 'Lahiru Silva',
  nic_number: '199935300063',
  designation: 'Logistics Coordinator',
  department: 'Operations',
  employment_type: 'contract',
  date_of_joining: '2019-07-03',
};
const credential = await issuer.issue(
  {
    iss: 'https://api.univault.local/issuers/employer-a',
    issuer_name: 'Serendib Trading Company (Demo)',
    vct: 'urn:univault:vct:EmploymentCredential:1',
    schema_version: '1.0',
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 30 * 24 * 3600,
    cnf: { jwk: holder.jwk },
    status: { status_uri: 'https://api.univault.local/status/test' },
    ...subject,
  },
  { _sd: Object.keys(subject) },
  { header: { typ: 'dc+sd-jwt' } },
);

const fixture = {
  _note: 'TEST-ONLY throwaway keys for the SD-JWT spike. Never reuse.',
  credential,
  holderSecretKey: uint8ArrayToBase64Url(holder.secretKey),
  issuerPublicJwk: publicKey.export({ format: 'jwk' }),
  nonce: uint8ArrayToBase64Url(randomBytes(16)),
  aud: 'https://verifier.univault.local/v/spike',
  revealClaims: ['full_name', 'employee_id', 'designation'],
};
writeFileSync('fixture.json', `${JSON.stringify(fixture, null, 2)}\n`);
console.log('fixture.json written – copy it into the Expo spike project folder.');
