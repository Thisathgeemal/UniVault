// Demo: create an Employment SD-JWT and print what is inside it.
// Run from crypto-core/:  npm run demo:issue   (builds first, then runs this file)
import console from 'node:console';
import { createSdJwt, decodeSdJwt, generateIssuerKeys } from '../dist/node/index.js';

const issuer = await generateIssuerKeys();
const now = Math.floor(Date.now() / 1000);

const sdJwt = await createSdJwt(
  {
    iss: 'https://api.univault.local/issuers/employer-a',
    issuer_name: 'Serendib Trading Company (Demo)',
    vct: 'urn:univault:vct:EmploymentCredential:1',
    schema_version: '1.0',
    iat: now,
    exp: now + 365 * 24 * 3600,
    employee_id: 'STC-00001',
    full_name: 'Lahiru Silva',
    designation: 'Logistics Coordinator',
    department: 'Operations',
  },
  ['employee_id', 'full_name', 'designation', 'department'],
  { kid: issuer.kid, privateKey: issuer.privateKeyPem },
);

const decoded = await decodeSdJwt(sdJwt);
console.log('\n=== Compact SD-JWT ===\n' + sdJwt);
console.log('\n=== Header ===');
console.log(decoded.header);
console.log('\n=== Signed payload (subject claims replaced by _sd digests) ===');
console.log(decoded.payload);
console.log('\n=== Disclosures ===');
console.table(
  decoded.disclosures.map(({ name, value, salt, digest }) => ({ name, value, salt, digest })),
);
console.log('=== Issuer public key (JWK) ===');
console.log(issuer.publicJwk);
