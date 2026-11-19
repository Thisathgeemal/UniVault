// Demo: decode the disclosures of a KYC credential, then try tampered ones.
// Run from crypto-core/:  npm run demo:disclosures   (builds first, then runs this file)
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createSdJwt, decodeDisclosures, generateIssuerKeys } from '../dist/node/index.js';

const issuer = await generateIssuerKeys();
const token = await createSdJwt(
  {
    iss: 'https://api.univault.local/issuers/bank-a',
    issuer_name: 'UniVault Demo Bank',
    vct: 'urn:univault:vct:KYCCredential:1',
    full_name: 'Lahiru Silva',
    date_of_birth: '1999-12-18',
    age_over_18: true,
  },
  ['full_name', 'date_of_birth', 'age_over_18'],
  { kid: issuer.kid, privateKey: issuer.privateKeyPem },
);

const [jwt, ...rest] = token.split('~');
const disclosures = rest.slice(0, -1);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const [salt] = JSON.parse(Buffer.from(disclosures[1], 'base64url').toString());

const show = (label, t) => {
  const r = decodeDisclosures(t);
  console.log(`\n${label}  →  ${r.valid ? 'VALID' : 'REJECTED'}`);
  if (r.disclosures.length) {
    console.table(
      r.disclosures.map(({ name, value, salt: s, digest }) => ({ name, value, salt: s, digest })),
    );
  }
  for (const e of r.errors) console.log(`  ✗ disclosure #${e.index}: ${e.code} – ${e.message}`);
};

show('1. Genuine credential', token);
show(
  '2. Date of birth edited to 2010-01-01',
  [jwt, enc([salt, 'date_of_birth', '2010-01-01']), ''].join('~'),
);
show(
  '3. Forged age_over_18 disclosure',
  [jwt, enc(['forgedSalt0000000000000', 'age_over_18', true]), ''].join('~'),
);
show('4. Same disclosure sent twice', [jwt, disclosures[0], disclosures[0], ''].join('~'));
