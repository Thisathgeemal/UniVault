/**
 * The shared validation: issue mapping, the reference rule, and – the point of the package –
 * that the standalone code generated for the browser gives exactly the same issues as the
 * runtime-compiled validators the backend uses, for the same schema files.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ValidateFunction } from 'ajv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkExternalRef,
  CREDENTIAL_TYPES,
  CUSTOMER_REF_PATTERN,
  dataUriKilobytes,
  toClaimIssues,
  type CredentialTypeName,
} from '../src/index.js';
import { createClaimsAjv, readCredentialSchemas, standaloneValidatorsModule } from '../src/node.js';
import { formats, ucs2length } from '../src/runtime.js';

const SCHEMAS_DIR = fileURLToPath(new URL('../../docs/schemas/', import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url));
const schemas = readCredentialSchemas(SCHEMAS_DIR);

const employee = {
  employee_id: 'STC-90001',
  full_name: 'Nimesha Perera',
  designation: 'Sales Executive',
  department: 'Sales',
  employment_type: 'permanent',
  date_of_joining: '2022-03-01',
};
const address = {
  line1: 'No. 12, Temple Road',
  city: 'Kandy',
  district: 'Kandy',
  postal_code: '20000',
  country: 'LK',
};
const customer = {
  full_name: 'Kasun Bandara',
  id_document_type: 'nic',
  id_document_number: '199012345678',
  date_of_birth: '1990-05-01',
  age_over_18: true,
  nationality: 'LK',
  permanent_address: address,
  mobile_number: '+94771234567',
};
const SAMPLES: [CredentialTypeName, unknown][] = [
  ['EmploymentCredential', employee],
  ['EmploymentCredential', {}],
  ['EmploymentCredential', { ...employee, employee_id: 'stc 1', shoe_size: 42 }],
  ['EmploymentCredential', { ...employee, date_of_joining: '2022-02-30', work_email: 'nope' }],
  ['EmploymentCredential', { ...employee, full_name: 'N', designation: 'x'.repeat(81) }],
  ['EmploymentCredential', { ...employee, employment_type: 'intern', work_phone: '0771234567' }],
  ['EmploymentCredential', 'not an object'],
  ['KYCCredential', customer],
  ['KYCCredential', { ...customer, id_document_type: 'passport', id_document_number: 'N1234567' }],
  ['KYCCredential', { ...customer, id_document_type: 'passport' }],
  ['KYCCredential', { ...customer, permanent_address: { ...address, line1: 'P.O. Box 45' } }],
  ['KYCCredential', { ...customer, residential_address: { ...address, country: 'IN' } }],
  ['KYCCredential', { ...customer, permanent_address: { line1: 'No. 1' }, nationality: 'lk' }],
  // A surrogate pair counts as one character (Ajv's ucs2length) on both sides: 2 chars
  ['KYCCredential', { ...customer, full_name: '😀😀' }],
];

let workDir: string;
let standalone: Record<CredentialTypeName, ValidateFunction>;

beforeAll(async () => {
  // The generated module imports '@univault/claims-validation/runtime' (dist: pretest builds
  // it): give the temp folder a node_modules link to this package
  workDir = mkdtempSync(join(tmpdir(), 'univault-claims-'));
  const scope = join(workDir, 'node_modules', '@univault');
  mkdirSync(scope, { recursive: true });
  symlinkSync(PACKAGE_DIR, join(scope, 'claims-validation'), 'junction');
  const file = join(workDir, 'validators.mjs');
  writeFileSync(file, standaloneValidatorsModule(schemas));
  const mod = (await import(pathToFileURL(file).href)) as {
    validators: Record<CredentialTypeName, ValidateFunction>;
  };
  standalone = mod.validators;
});
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe('standalone (browser) and runtime (backend) validators agree', () => {
  const ajv = createClaimsAjv();
  const runtime = Object.fromEntries(
    CREDENTIAL_TYPES.map((type) => [type, ajv.compile(schemas[type])]),
  ) as Record<CredentialTypeName, ValidateFunction>;

  it.each(SAMPLES.map((s, i) => [i, ...s] as const))(
    'sample %i (%s): same validity and the same issues',
    (_i, type, claims) => {
      const a = runtime[type](claims);
      const b = standalone[type](claims);
      expect(b).toBe(a);
      expect(toClaimIssues(standalone[type].errors)).toEqual(toClaimIssues(runtime[type].errors));
    },
  );

  it('the generated module also exports the schemas it was built from', async () => {
    const mod = (await import(pathToFileURL(join(workDir, 'validators.mjs')).href)) as {
      schemas: unknown;
    };
    expect(mod.schemas).toEqual(schemas);
  });
});

describe('toClaimIssues – friendly messages and codes', () => {
  const ajv = createClaimsAjv();
  const issuesFor = (type: CredentialTypeName, claims: unknown) => {
    const validate = ajv.compile(schemas[type]);
    validate(claims);
    return toClaimIssues(validate.errors);
  };

  it('maps each kind of problem to a code and the backend message', () => {
    expect(
      issuesFor('EmploymentCredential', { ...employee, shoe_size: 1, full_name: 'N' }),
    ).toEqual([
      { path: 'shoe_size', code: 'notAllowed', message: 'is not allowed by the credential schema' },
      {
        path: 'full_name',
        code: 'minLength',
        message: 'must NOT have fewer than 2 characters',
        params: { limit: 2 },
      },
    ]);
    const kyc = issuesFor('KYCCredential', {
      ...customer,
      id_document_type: 'passport',
      permanent_address: { ...address, line1: 'PO Box 7', country: 'IN' },
      email: 'x',
    });
    expect(kyc).toEqual(
      expect.arrayContaining([
        { path: 'id_document_expiry', code: 'required', message: 'is required' },
        {
          path: 'id_document_number',
          code: 'pattern',
          message: 'must match pattern "^[A-Z][0-9]{7}$"',
        },
        {
          path: 'permanent_address.line1',
          code: 'poBox',
          message: 'must be a street address (P.O. Box addresses are not accepted)',
        },
        {
          path: 'permanent_address.country',
          code: 'const',
          message: 'must be equal to constant',
        },
        {
          path: 'email',
          code: 'format',
          message: 'must match format "email"',
          params: { format: 'email' },
        },
      ]),
    );
    // The if/then summary line is dropped
    expect(kyc.some((i) => i.message.includes('"then"'))).toBe(false);
  });

  it('reports a non-object as one issue on "(claims)"; unknown keywords become "invalid"', () => {
    expect(issuesFor('EmploymentCredential', 7)).toEqual([
      { path: '(claims)', code: 'type', message: 'must be object' },
    ]);
    expect(
      toClaimIssues([
        { keyword: 'not', instancePath: '', schemaPath: '#', params: {} },
        { keyword: 'uniqueItems', instancePath: '/a', schemaPath: '#', params: {} },
        { keyword: 'uniqueItems', instancePath: '/a', schemaPath: '#', params: {} },
      ]),
    ).toEqual([
      { path: '(claims)', code: 'notAccepted', message: 'is not an accepted value' },
      { path: 'a', code: 'invalid', message: 'is invalid' },
    ]);
    expect(toClaimIssues(null)).toEqual([]);
  });
});

describe('checkExternalRef', () => {
  it('employee: the reference is employee_id; a different externalRef is refused', () => {
    expect(checkExternalRef('employee', undefined, employee)).toEqual({
      externalRef: 'STC-90001',
      issues: [],
    });
    expect(checkExternalRef('employee', 'STC-90001', employee).issues).toEqual([]);
    expect(checkExternalRef('employee', 'OTHER', employee).issues).toEqual([
      {
        path: 'externalRef',
        code: 'mismatch',
        message: 'must equal claims.employee_id for employee records',
      },
    ]);
    expect(checkExternalRef('employee', undefined, {}).externalRef).toBeUndefined();
  });

  it('customer: required, and 3–30 uppercase letters, digits or hyphens', () => {
    expect(checkExternalRef('customer', undefined, customer).issues[0]?.code).toBe('required');
    expect(checkExternalRef('customer', '', customer).issues[0]?.code).toBe('required');
    expect(checkExternalRef('customer', 'cus-1', customer).issues[0]).toMatchObject({
      code: 'pattern',
      message: 'must be 3–30 uppercase letters, digits or hyphens',
    });
    expect(checkExternalRef('customer', 'CUS-000123', customer)).toEqual({
      externalRef: 'CUS-000123',
      issues: [],
    });
    expect(CUSTOMER_REF_PATTERN.test('-AB')).toBe(false);
    expect(CUSTOMER_REF_PATTERN.test('A'.repeat(31))).toBe(false);
  });
});

describe('runtime helpers', () => {
  it('give the Ajv string length and the ajv-formats implementations', () => {
    expect(ucs2length('😀a')).toBe(2);
    expect(Object.keys(formats)).toEqual(expect.arrayContaining(['date', 'email']));
  });
});

describe('portrait size (Decision 020)', () => {
  const ajv = createClaimsAjv();
  const validate = ajv.compile(schemas.EmploymentCredential);
  const limit = (schemas.EmploymentCredential.properties as Record<string, { maxLength: number }>)
    .portrait!.maxLength;
  const portrait = (base64Chars: number) => `data:image/jpeg;base64,${'A'.repeat(base64Chars)}`;

  it('the schema allows 40 KB of image data: the limit is derived from maxLength', () => {
    expect(limit).toBe(54639);
    expect(dataUriKilobytes(limit)).toBe(40);
    expect(dataUriKilobytes(0)).toBe(0);
    // Exactly 40 KB (40 960 bytes = 54 616 base64 characters) is accepted
    expect(validate({ ...employee, portrait: portrait(54616) })).toBe(true);
  });

  it('a larger photo gives one issue with the plain message', () => {
    validate({ ...employee, portrait: portrait(54620) });
    expect(toClaimIssues(validate.errors)).toEqual([
      {
        path: 'portrait',
        code: 'photoTooLarge',
        message: 'Photo must be under 40 KB – use a smaller image',
        params: { limit: 54639, kilobytes: 40 },
      },
    ]);
  });

  it('the portrait is selectively disclosable in both schemas', () => {
    for (const type of CREDENTIAL_TYPES) {
      const meta = schemas[type]['x-univault'] as { selectivelyDisclosable: string[] };
      expect(meta.selectivelyDisclosable, type).toContain('portrait');
    }
  });
});
