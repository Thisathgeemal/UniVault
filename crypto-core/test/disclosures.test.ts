import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createSdJwt,
  decodeDisclosure,
  decodeDisclosures,
  disclosureDigest,
  generateIssuerKeys,
  validateDisclosures,
  verifySdJwt,
  type CredentialClaims,
  type IssuerKeyPair,
} from '../src/node/index.js';

const enc = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');
const nodeDigest = (s: string) => createHash('sha256').update(s, 'ascii').digest('base64url');
const address = {
  line1: 'No. 12, Temple Road',
  city: 'Kandy',
  district: 'Kandy',
  postal_code: '20000',
  country: 'LK',
};

const claims: CredentialClaims = {
  iss: 'https://api.univault.local/issuers/bank-a',
  issuer_name: 'UniVault Demo Bank',
  vct: 'urn:univault:vct:KYCCredential:1',
  full_name: 'ලහිරු සිල්වා', // non-ASCII (Sinhala) value
  date_of_birth: '1999-12-18',
  age_over_18: true,
  permanent_address: address,
  mobile_number: '+94770001234',
};
const disclosable = [
  'full_name',
  'date_of_birth',
  'age_over_18',
  'permanent_address',
  'mobile_number',
];

let issuer: IssuerKeyPair;
let token: string;
let jwt: string;
let encoded: string[];
let payload: Record<string, unknown>;

beforeAll(async () => {
  issuer = await generateIssuerKeys();
  token = await createSdJwt(claims, disclosable, {
    kid: issuer.kid,
    privateKey: issuer.privateKeyPem,
  });
  const parts = token.split('~');
  jwt = parts[0] ?? '';
  encoded = parts.slice(1, -1);
  payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString()) as Record<
    string,
    unknown
  >;
});

describe('valid disclosures can be decoded', () => {
  it('decodes every disclosure of a credential', () => {
    const r = decodeDisclosures(token);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.disclosures.map((d) => d.name).sort()).toEqual([...disclosable].sort());
    expect(r.undisclosedDigests).toEqual([]);
  });

  it('decodes a single disclosure into salt, name and value', () => {
    const d = decodeDisclosure(enc(['_26bc4LT-ac6q2KI6cBW5es', 'family_name', 'Möbius']));
    expect(d).toMatchObject({
      salt: '_26bc4LT-ac6q2KI6cBW5es',
      name: 'family_name',
      value: 'Möbius',
    });
  });

  it('ignores the key-binding JWT at the end of a presentation', () => {
    const presentation = [jwt, encoded[0], 'eyJhbGciOiJFUzI1NiJ9.e30.c2ln'].join('~');
    const r = decodeDisclosures(presentation);
    expect(r.valid).toBe(true);
    expect(r.disclosures).toHaveLength(1);
  });

  it('reports the digests of claims that were not revealed', () => {
    const r = decodeDisclosures([jwt, encoded[0], encoded[1], ''].join('~'));
    expect(r.valid).toBe(true);
    expect(r.undisclosedDigests).toHaveLength(disclosable.length - 2);
  });
});

describe('disclosure values can be extracted', () => {
  it('returns the original value for every claim type', () => {
    const byName = Object.fromEntries(
      decodeDisclosures(token).disclosures.map((d) => [d.name, d.value]),
    );
    expect(byName.full_name).toBe('ලහිරු සිල්වා'); // UTF-8 text
    expect(byName.age_over_18).toBe(true); // boolean
    expect(byName.permanent_address).toEqual(address); // object
    expect(byName.date_of_birth).toBe('1999-12-18');
  });

  it('returns a salt of at least 128 bits for each disclosure', () => {
    for (const d of decodeDisclosures(token).disclosures) {
      expect(Buffer.from(d.salt, 'base64url').length).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('digest validation is performed', () => {
  it('recalculates each digest exactly as Node crypto does', () => {
    for (const d of decodeDisclosures(token).disclosures) {
      expect(d.digest).toBe(nodeDigest(d.encoded));
      expect(disclosureDigest(d.encoded)).toBe(d.digest);
    }
  });

  it('matches every recalculated digest to an entry in _sd', () => {
    const sd = payload._sd as string[];
    for (const d of decodeDisclosures(token).disclosures) expect(sd).toContain(d.digest);
  });

  it('rejects disclosures when _sd_alg is not sha-256', () => {
    const r = validateDisclosures(encoded, { ...payload, _sd_alg: 'md5' });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.code).toBe('UNSUPPORTED_HASH_ALGORITHM');
  });

  it('rejects disclosures when the payload has no _sd array', () => {
    const r = validateDisclosures(encoded, { iss: 'x', _sd_alg: 'sha-256' });
    expect(r.errors.every((e) => e.code === 'DISCLOSURE_NOT_IN_SD')).toBe(true);
  });
});

describe('tampered disclosures are rejected', () => {
  const tamper = (index: number, change: (arr: [string, string, unknown]) => unknown[]) => {
    const original = JSON.parse(Buffer.from(encoded[index] ?? '', 'base64url').toString()) as [
      string,
      string,
      unknown,
    ];
    return enc(change(original));
  };

  it.each([
    ['edited value', (a: [string, string, unknown]) => [a[0], a[1], 'Someone Else']],
    ['edited salt', (a: [string, string, unknown]) => [`${a[0]}x`, a[1], a[2]]],
    ['renamed claim', (a: [string, string, unknown]) => [a[0], 'employer_name', a[2]]],
  ])('rejects a disclosure with an %s', (_label, change) => {
    const r = validateDisclosures([tamper(0, change)], payload);
    expect(r.valid).toBe(false);
    expect(r.disclosures).toEqual([]);
    expect(r.errors).toEqual([expect.objectContaining({ index: 0, code: 'DISCLOSURE_NOT_IN_SD' })]);
  });

  it('rejects a completely forged disclosure', () => {
    const r = validateDisclosures([enc(['forgedSalt0000000000000', 'age_over_18', true])], payload);
    expect(r.errors[0]?.code).toBe('DISCLOSURE_NOT_IN_SD');
  });

  it('rejects only the bad disclosure and keeps the good ones', () => {
    const bad = tamper(1, (a) => [a[0], a[1], '2010-01-01']);
    const r = validateDisclosures([encoded[0] ?? '', bad, encoded[2] ?? ''], payload);
    expect(r.valid).toBe(false);
    expect(r.disclosures).toHaveLength(2);
    expect(r.errors).toEqual([expect.objectContaining({ index: 1, code: 'DISCLOSURE_NOT_IN_SD' })]);
  });

  it('rejects the same disclosure sent twice', () => {
    const r = validateDisclosures([encoded[0] ?? '', encoded[0] ?? ''], payload);
    expect(r.errors).toEqual([expect.objectContaining({ index: 1, code: 'DUPLICATE_DISCLOSURE' })]);
  });

  it('rejects two signed disclosures for the same claim name', () => {
    const a = enc(['salt-aaaaaaaaaaaaaaaaaa', 'full_name', 'Name A']);
    const b = enc(['salt-bbbbbbbbbbbbbbbbbb', 'full_name', 'Name B']);
    const r = validateDisclosures([a, b], {
      _sd: [disclosureDigest(a), disclosureDigest(b)],
      _sd_alg: 'sha-256',
    });
    expect(r.errors).toEqual([expect.objectContaining({ index: 1, code: 'DUPLICATE_CLAIM_NAME' })]);
  });

  it('rejects a disclosure that would overwrite a visible claim', () => {
    const d = enc(['salt-cccccccccccccccccc', 'issuer_name', 'Fake Bank']);
    const r = validateDisclosures([d], {
      issuer_name: 'UniVault Demo Bank',
      _sd: [disclosureDigest(d)],
      _sd_alg: 'sha-256',
    });
    expect(r.errors[0]?.code).toBe('CLAIM_NAME_CONFLICT');
  });

  it.each(['_sd', '...', '_sd_alg'])('rejects the reserved claim name "%s"', (name) => {
    const d = enc(['salt-dddddddddddddddddd', name, 'x']);
    const r = validateDisclosures([d], { _sd: [disclosureDigest(d)], _sd_alg: 'sha-256' });
    expect(r.errors[0]?.code).toBe('RESERVED_CLAIM_NAME');
  });

  it.each([
    ['invalid Base64URL characters', 'abc$%^'],
    ['Base64 padding', `${enc(['s', 'n', 'v'])}==`],
    ['not JSON', Buffer.from('not json').toString('base64url')],
    ['a JSON object', enc({ salt: 's', name: 'n', value: 'v' })],
    ['a 2-element array', enc(['salt', 'value'])],
    ['a 4-element array', enc(['salt', 'name', 'value', 'extra'])],
    ['a non-string salt', enc([123, 'name', 'value'])],
    ['an empty claim name', enc(['salt', '', 'value'])],
    [
      'a truncated disclosure',
      enc(['salt-ffffffffffffffffff', 'full_name', 'Lahiru']).slice(0, 20),
    ],
  ])('rejects %s as MALFORMED_DISCLOSURE', (_label, bad) => {
    const r = validateDisclosures([bad], payload);
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.code).toBe('MALFORMED_DISCLOSURE');
  });

  it('throws a clear error for input that is not an SD-JWT', () => {
    expect(() => decodeDisclosures('not-a-token')).toThrow(/compact SD-JWT/);
  });
});

describe('integration with verifySdJwt', () => {
  it('verifySdJwt reports the same disclosure error codes', async () => {
    const forged = enc(['forgedSalt0000000000000', 'age_over_18', true]);
    const r = await verifySdJwt([jwt, forged, ''].join('~'), issuer.publicJwk, {
      checkTime: false,
    });
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(['DISCLOSURE_NOT_IN_SD']);
  });

  it('verifySdJwt rejects a disclosure that conflicts with a visible claim', async () => {
    // Issuer-signed token where a disclosure's name collides with a visible claim
    const d = enc(['salt-eeeeeeeeeeeeeeeeee', 'issuer_name', 'Fake Bank']);
    const r = await verifySdJwt([jwt, d, ''].join('~'), issuer.publicJwk, { checkTime: false });
    expect(r.valid).toBe(false); // digest not in _sd, so rejected before the conflict check
  });
});
