// Demo: verify a genuine credential, then three tampered copies.
// Run from crypto-core/:  npm run demo:verify   (builds first, then runs this file)
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createSdJwt, generateIssuerKeys, verifySdJwt } from '../dist/node/index.js';

const issuer = await generateIssuerKeys();
const impostor = await generateIssuerKeys();
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: 'https://api.univault.local/issuers/employer-a',
  issuer_name: 'Serendib Trading Company (Demo)',
  vct: 'urn:univault:vct:EmploymentCredential:1',
  iat: now,
  exp: now + 365 * 24 * 3600,
  employee_id: 'STC-00001',
  full_name: 'Lahiru Silva',
  designation: 'Logistics Coordinator',
};
const disclosable = ['employee_id', 'full_name', 'designation'];
const token = await createSdJwt(claims, disclosable, {
  kid: issuer.kid,
  privateKey: issuer.privateKeyPem,
});

const [jwt, ...rest] = token.split('~');
const [h, p, s] = jwt.split('.');
const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const payload = JSON.parse(Buffer.from(p, 'base64url').toString());

const cases = {
  '1. Genuine credential': token,
  '2. Payload modified (issuer_name changed)': [
    `${h}.${enc({ ...payload, issuer_name: 'Fake Bank' })}.${s}`,
    ...rest,
  ].join('~'),
  '3. Forged disclosure (designation = CEO)': [jwt, enc(['salt', 'designation', 'CEO']), ''].join(
    '~',
  ),
  '4. Signed by an impostor key': await createSdJwt(claims, disclosable, {
    kid: issuer.kid,
    privateKey: impostor.privateKeyPem,
  }),
};

for (const [label, t] of Object.entries(cases)) {
  const r = await verifySdJwt(t, issuer.publicJwk);
  console.log(
    `\n${label}  →  ${r.valid ? 'VALID' : 'REJECTED'}${r.errors.length ? `  (${r.errors.join(', ')})` : ''}`,
  );
  console.table(r.checks.map(({ name, status, detail }) => ({ check: name, status, detail })));
}
