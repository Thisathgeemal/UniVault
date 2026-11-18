/**
 * Verifies a presentation produced on the PHONE against fixture.json.
 * Checks: issuer RS256 signature, disclosure digests, key-binding JWT (ES256,
 * holder key from cnf), nonce, audience, and that only the chosen claims are revealed.
 *
 * Run: node verify-presentation.mjs presentation.txt
 *      (presentation.txt = the string the Expo app printed in the Metro terminal)
 */
import { createPublicKey, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SdJwtInstance, base64UrlToUint8Array } from '@sd-jwt/core';
import { hasher, es256Verify } from './holder-purejs.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node verify-presentation.mjs presentation.txt');
  process.exit(1);
}
const fixture = JSON.parse(readFileSync('fixture.json', 'utf8'));
const presentation = readFileSync(file, 'utf8').trim();
const issuerKey = createPublicKey({ key: fixture.issuerPublicJwk, format: 'jwk' });

const verifier = new SdJwtInstance({
  verifier: (data, sig) => {
    const v = createVerify('RSA-SHA256');
    v.update(data);
    return v.verify(issuerKey, Buffer.from(base64UrlToUint8Array(sig)));
  },
  hasher,
  hashAlg: 'sha-256',
  kbVerifier: (data, sig, payload) => es256Verify(payload.cnf.jwk, data, sig),
});

try {
  const { payload, kb } = await verifier.verify(presentation, {
    keyBindingNonce: fixture.nonce,
    expectedKeyBindingAudience: fixture.aud,
    allowedIssuerAlgorithms: ['RS256'],
    allowedKeyBindingAlgorithms: ['ES256'],
    requiredClaimKeys: fixture.revealClaims,
  });
  const revealed = [
    'employee_id',
    'full_name',
    'nic_number',
    'designation',
    'department',
    'employment_type',
    'date_of_joining',
  ].filter((k) => k in payload);
  const onlyChosen = revealed.length === fixture.revealClaims.length;
  console.log(
    'PASS  Phone-made presentation verified on Node (RS256 issuer + ES256 key binding + nonce + audience)',
  );
  console.log(`${onlyChosen ? 'PASS' : 'FAIL'}  Revealed claims: ${revealed.join(', ')}`);
  console.log(
    `      KB-JWT alg: ${kb.header.alg}, nonce matches: ${kb.payload.nonce === fixture.nonce}`,
  );
  process.exit(onlyChosen ? 0 : 1);
} catch (e) {
  console.error(`FAIL  ${e.message}`);
  process.exit(1);
}
