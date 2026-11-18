/**
 * UniVault SD-JWT spike – Node.js
 *
 * Issuer + verifier run on Node.js (native crypto, RS256).
 * Holder runs the PURE-JS code from holder-purejs.mjs (same code as the Expo test).
 *
 * Run: node spike-node.mjs
 */
import { generateKeyPairSync, createSign, createVerify, getRandomValues } from 'node:crypto';
import { SdJwtInstance, uint8ArrayToBase64Url, base64UrlToUint8Array } from '@sd-jwt/core';
import {
  hasher,
  createHolderKey,
  createWalletSdJwt,
  buildPresentation,
  es256Verify,
} from './holder-purejs.mjs';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` – ${detail}` : ''}`);
};
const randomBytes = (n) => getRandomValues(new Uint8Array(n));

// ---------------------------------------------------------------------------
// Issuer (backend) – RS256 with Node's native crypto
// ---------------------------------------------------------------------------
const issuerKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });

const rs256Signer = (data) => {
  const s = createSign('RSA-SHA256');
  s.update(data);
  return uint8ArrayToBase64Url(new Uint8Array(s.sign(issuerKeys.privateKey)));
};
const rs256Verifier = (data, sig) => {
  const v = createVerify('RSA-SHA256');
  v.update(data);
  return v.verify(issuerKeys.publicKey, Buffer.from(base64UrlToUint8Array(sig)));
};

const issuer = new SdJwtInstance({
  signer: rs256Signer,
  signAlg: 'RS256',
  hasher,
  hashAlg: 'sha-256',
  saltGenerator: (len) => uint8ArrayToBase64Url(randomBytes(len)),
});

// ---------------------------------------------------------------------------
// Holder key (wallet) – generated with pure JS
// ---------------------------------------------------------------------------
const holder = createHolderKey(randomBytes);

// Employment credential, shaped like docs/schemas (envelope + subject claims)
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: 'https://api.univault.local/issuers/employer-a',
  issuer_name: 'Serendib Trading Company (Demo)',
  vct: 'urn:univault:vct:EmploymentCredential:1',
  schema_version: '1.0',
  jti: crypto.randomUUID(),
  iat: now,
  exp: now + 365 * 24 * 3600,
  cnf: { jwk: holder.jwk },
  status: { status_uri: 'https://api.univault.local/status/123' },
  employee_id: 'STC-00001',
  full_name: 'Lahiru Silva',
  nic_number: '199935300063',
  designation: 'Logistics Coordinator',
  department: 'Operations',
  employment_type: 'contract',
  date_of_joining: '2019-07-03',
};
const subjectClaims = [
  'employee_id',
  'full_name',
  'nic_number',
  'designation',
  'department',
  'employment_type',
  'date_of_joining',
];

let t = performance.now();
const credential = await issuer.issue(
  payload,
  { _sd: subjectClaims },
  { header: { typ: 'dc+sd-jwt' } },
);
const issueMs = performance.now() - t;
check(
  'Issue RS256 SD-JWT (Node)',
  credential.split('~').length === subjectClaims.length + 2,
  `${issueMs.toFixed(1)} ms, ${credential.length} chars`,
);

// Envelope visible, subject claims hidden in the signed JWT
const signedPayload = JSON.parse(
  new TextDecoder().decode(base64UrlToUint8Array(credential.split('.')[1])),
);
check(
  'Subject claims are hidden in signed payload (_sd digests only)',
  !('full_name' in signedPayload) &&
    signedPayload._sd.length === subjectClaims.length &&
    signedPayload._sd_alg === 'sha-256',
);
check(
  'Envelope claims stay visible',
  signedPayload.iss && signedPayload.cnf && signedPayload.status && signedPayload.vct,
);

// ---------------------------------------------------------------------------
// Wallet – decode and present (pure JS)
// ---------------------------------------------------------------------------
const wallet = createWalletSdJwt(holder.secretKey);
const claimsInWallet = await wallet.getClaims(credential);
check('Wallet decodes all claims (pure JS)', claimsInWallet.full_name === 'Lahiru Silva');

const nonce = uint8ArrayToBase64Url(randomBytes(16));
const aud = 'https://verifier.univault.local/v/abc';
t = performance.now();
const presentation = await buildPresentation(
  wallet,
  credential,
  ['full_name', 'employee_id', 'designation'],
  { nonce, aud },
);
const presentMs = performance.now() - t;
check(
  'Wallet builds presentation with ES256 key binding (pure JS)',
  presentation.split('~').length === 5,
  `${presentMs.toFixed(1)} ms`,
);

// ---------------------------------------------------------------------------
// Verifier (backend) – RS256 issuer check + KB-JWT check against cnf.jwk
// ---------------------------------------------------------------------------
const verifier = new SdJwtInstance({
  verifier: rs256Verifier,
  hasher,
  hashAlg: 'sha-256',
  kbVerifier: (data, sig, kbIssuerPayload) => es256Verify(kbIssuerPayload.cnf.jwk, data, sig),
});
const verifyOpts = {
  keyBindingNonce: nonce,
  expectedKeyBindingAudience: aud,
  allowedIssuerAlgorithms: ['RS256'],
  allowedKeyBindingAlgorithms: ['ES256'],
  keyBindingMaxAgeSeconds: 300,
  requiredClaimKeys: ['full_name', 'employee_id', 'designation'],
};

const ok = await verifier.verify(presentation, verifyOpts);
check('Verifier accepts valid presentation', ok.payload.full_name === 'Lahiru Silva' && !!ok.kb);
check(
  'Undisclosed claims are NOT visible to verifier',
  !('nic_number' in ok.payload) &&
    !('department' in ok.payload) &&
    !('date_of_joining' in ok.payload),
  `verifier sees: ${Object.keys(ok.payload)
    .filter((k) => subjectClaims.includes(k))
    .join(', ')}`,
);

// ---------------------------------------------------------------------------
// Negative tests
// ---------------------------------------------------------------------------
const rejects = async (name, fn) => {
  try {
    await fn();
    check(name, false, 'was accepted');
  } catch (e) {
    check(name, true, `rejected: ${String(e.message).slice(0, 70)}`);
  }
};

await rejects('Replay: wrong nonce rejected', () =>
  verifier.verify(presentation, { ...verifyOpts, keyBindingNonce: 'other-nonce' }),
);
await rejects('Wrong audience rejected', () =>
  verifier.verify(presentation, {
    ...verifyOpts,
    expectedKeyBindingAudience: 'https://evil.example',
  }),
);

// Tampered disclosure: replace a disclosure with a forged one
const parts = presentation.split('~');
const forged = uint8ArrayToBase64Url(
  new TextEncoder().encode(JSON.stringify(['fakesalt', 'designation', 'CEO'])),
);
const tamperedDisclosure = [parts[0], forged, ...parts.slice(2)].join('~');
await rejects('Forged disclosure rejected', () => verifier.verify(tamperedDisclosure, verifyOpts));

// Tampered issuer payload: change a visible claim
const [h, p, s] = parts[0].split('.');
const badPayload = {
  ...JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(p))),
  issuer_name: 'Fake Bank',
};
const tamperedJwt = [
  h,
  uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(badPayload))),
  s,
].join('.');
await rejects('Tampered issuer payload rejected (RS256 signature)', () =>
  verifier.verify([tamperedJwt, ...parts.slice(1)].join('~'), verifyOpts),
);

// Stolen credential: attacker presents with their own key (cnf mismatch)
const attacker = createHolderKey(randomBytes);
const stolenPresentation = await buildPresentation(
  createWalletSdJwt(attacker.secretKey),
  credential,
  ['full_name'],
  { nonce, aud },
);
await rejects('Presentation signed by a different holder key rejected', () =>
  verifier.verify(stolenPresentation, { ...verifyOpts, requiredClaimKeys: ['full_name'] }),
);

// Missing key binding
const noKb = await wallet.present(credential, { full_name: true });
await rejects('Presentation without key binding rejected when KB required', () =>
  verifier.verify(noKb, { ...verifyOpts, requiredClaimKeys: ['full_name'] }),
);

// ---------------------------------------------------------------------------
// Custom fallback: hand-built SD-JWT (salt → disclosure → base64url → SHA-256 → _sd → RS256)
// verified by the library – proves the custom approach is viable if ever needed.
// ---------------------------------------------------------------------------
const b64u = (bytes) => uint8ArrayToBase64Url(bytes);
const enc = (obj) => b64u(new TextEncoder().encode(JSON.stringify(obj)));
const disclosures = ['full_name', 'employee_id'].map((name) =>
  enc([b64u(randomBytes(16)), name, payload[name]]),
);
const digests = disclosures.map((d) => b64u(hasher(d, 'sha-256')));
const manualPayload = {
  iss: payload.iss,
  iat: now,
  exp: payload.exp,
  vct: payload.vct,
  cnf: payload.cnf,
  _sd: digests.sort(),
  _sd_alg: 'sha-256',
};
const signingInput = `${enc({ alg: 'RS256', typ: 'dc+sd-jwt' })}.${enc(manualPayload)}`;
const manualSdJwt = `${signingInput}.${rs256Signer(signingInput)}~${disclosures.join('~')}~`;
const manualVerified = await new SdJwtInstance({
  verifier: rs256Verifier,
  hasher,
  hashAlg: 'sha-256',
}).verify(manualSdJwt);
check(
  'Custom hand-built SD-JWT verifies with the library (fallback viable)',
  manualVerified.payload.full_name === 'Lahiru Silva',
);

// ---------------------------------------------------------------------------
// Benchmarks (Node, pure-JS crypto – a phone is typically several times slower)
// ---------------------------------------------------------------------------
const bench = async (label, n, fn) => {
  const start = performance.now();
  for (let i = 0; i < n; i += 1) await fn();
  return `${label}: ${((performance.now() - start) / n).toFixed(2)} ms`;
};
const { default: forge } = await import('node-forge');
forge.options.usePureJavaScript = true; // honest pure-JS timing (as on a phone)
console.log('\nBenchmarks (avg per operation, this machine):');
console.log(
  '  ' +
    (await bench('ES256 holder keygen (noble, pure JS)', 50, () => createHolderKey(randomBytes))),
);
console.log(
  '  ' +
    (await bench('Build presentation incl. ES256 KB-JWT (pure JS)', 50, () =>
      buildPresentation(wallet, credential, ['full_name'], { nonce, aud }),
    )),
);
console.log(
  '  ' +
    (await bench('SHA-256 of a disclosure (noble, pure JS)', 2000, () =>
      hasher('WyJzYWx0IiwibmFtZSIsInZhbHVlIl0', 'sha-256'),
    )),
);
console.log(
  '  ' +
    (await bench('RSA-2048 keygen (node-forge, pure JS)', 3, () =>
      forge.pki.rsa.generateKeyPair({ bits: 2048 }),
    )),
);
console.log(
  '  ' +
    (await bench('RSA-2048 keygen (Node native)', 3, () =>
      generateKeyPairSync('rsa', { modulusLength: 2048 }),
    )),
);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
