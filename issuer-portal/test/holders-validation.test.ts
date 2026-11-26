/**
 * Browser validation = backend validation (Decision 018). The SAME samples – every record of
 * the backend's synthetic seed data plus crafted invalid claims – go through the portal's
 * validator (precompiled standalone code from 'virtual:claims-validators') and the backend's
 * (backend/src/services/credential-schemas.ts, compiled at runtime), and must give identical
 * issues. Also: the form is generated from the schema (every claim is in the form or
 * deliberately omitted), the if/then rules, and translations for every field and option.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CredentialTypeName } from '@univault/claims-validation';
import { describe, expect, it } from 'vitest';
import { schemas } from 'virtual:claims-validators';
import { loadCredentialSchemas } from '../../backend/src/services/credential-schemas.js';
import type { ApiClient } from '../src/api/client.js';
import { fetchHolderCredentials } from '../src/api/credentials.js';
import { createHolder, fetchHolder, fetchHolders } from '../src/api/holders.js';
import { maskIdNumber, optionLabel } from '../src/holders/display.js';
import {
  activePattern,
  enumOptions,
  EXTERNAL_REF,
  FORM_UI,
  initialFormState,
  inputKind,
  matchesIf,
  OMITTED_CLAIMS,
  propertySchema,
  requiredPaths,
  schemaLeafPaths,
  SUPPORTED_IF_KEYWORDS,
  toClaims,
  visibleFields,
  type JsonSchema,
} from '../src/holders/form-model.js';
import {
  fieldKey,
  issueMessage,
  serverFieldIssues,
  validateClaims,
  validateHolderForm,
} from '../src/holders/validation.js';
import { en } from '../src/i18n/locales/en.js';
import { formatCalendarDate, formatColomboDate } from '../src/lib/format.js';
import { i18n } from '../src/i18n/index.js';

// Plain paths (a new URL(..., import.meta.url) template would become a Vite asset glob)
const REPO = join(import.meta.dirname, '..', '..');
const backend = loadCredentialSchemas();
const seed = (file: string) =>
  (
    JSON.parse(readFileSync(join(REPO, 'backend', 'seed-data', file), 'utf8')) as {
      records: { claims: Record<string, unknown> }[];
    }
  ).records.map((r) => r.claims);
const employees = seed('employees.json');
const customers = seed('customers.json');
const employee = employees[0]!;
const customer = customers[0]!;
const address = customer.permanent_address as Record<string, unknown>;

const INVALID: [CredentialTypeName, string, unknown][] = [
  ['EmploymentCredential', 'empty object', {}],
  ['EmploymentCredential', 'not an object', 'claims'],
  ['EmploymentCredential', 'lower-case employee id', { ...employee, employee_id: 'stc-1' }],
  ['EmploymentCredential', 'extra field', { ...employee, salary: 250000 }],
  ['EmploymentCredential', 'unknown employment type', { ...employee, employment_type: 'intern' }],
  ['EmploymentCredential', 'impossible date', { ...employee, date_of_joining: '2019-02-30' }],
  [
    'EmploymentCredential',
    'date in another format',
    { ...employee, date_of_joining: '03/07/2019' },
  ],
  ['EmploymentCredential', 'short name', { ...employee, full_name: 'A' }],
  ['EmploymentCredential', 'long designation', { ...employee, designation: 'x'.repeat(81) }],
  ['EmploymentCredential', 'bad NIC', { ...employee, nic_number: '12345' }],
  ['EmploymentCredential', 'bad email', { ...employee, work_email: 'not-an-email' }],
  ['EmploymentCredential', 'local phone', { ...employee, work_phone: '0771234567' }],
  ['EmploymentCredential', 'number instead of text', { ...employee, department: 42 }],
  ['KYCCredential', 'empty object', {}],
  ['KYCCredential', 'passport without expiry', { ...customer, id_document_type: 'passport' }],
  [
    'KYCCredential',
    'passport number pattern',
    {
      ...customer,
      id_document_type: 'passport',
      id_document_number: 'n12',
      id_document_expiry: '2030-01-01',
    },
  ],
  [
    'KYCCredential',
    'driving licence without expiry',
    { ...customer, id_document_type: 'driving_licence', id_document_number: 'B1234567' },
  ],
  ['KYCCredential', 'NIC number pattern', { ...customer, id_document_number: '99999' }],
  ['KYCCredential', 'unknown document type', { ...customer, id_document_type: 'library_card' }],
  [
    'KYCCredential',
    'P.O. Box address',
    { ...customer, permanent_address: { ...address, line1: 'P.O. Box 45' } },
  ],
  [
    'KYCCredential',
    'PO Box without dots',
    { ...customer, permanent_address: { ...address, line1: 'PO Box 7, Kandy' } },
  ],
  [
    'KYCCredential',
    'residential address without proof',
    { ...customer, residential_address: address, residence_proof_type: undefined },
  ],
  [
    'KYCCredential',
    'address outside Sri Lanka, bad district and postcode',
    {
      ...customer,
      permanent_address: { ...address, country: 'IN', district: 'Mumbai', postal_code: '1234' },
    },
  ],
  ['KYCCredential', 'incomplete address', { ...customer, permanent_address: { line1: 'No. 1' } }],
  ['KYCCredential', 'lower-case nationality', { ...customer, nationality: 'lk' }],
  ['KYCCredential', 'landline as mobile', { ...customer, mobile_number: '+94112345678' }],
  ['KYCCredential', 'missing age_over_18', (({ age_over_18: _a, ...rest }) => rest)(customer)],
  ['KYCCredential', 'extra field', { ...customer, gender: 'F' }],
];

describe('browser and backend validators agree', () => {
  it.each(employees.map((claims, i) => [i, claims] as const))(
    'employee seed record %i: valid on both sides',
    (_i, claims) => {
      expect(validateClaims('EmploymentCredential', claims)).toEqual([]);
      expect(backend.validate('EmploymentCredential', claims)).toEqual([]);
    },
  );

  it.each(customers.map((claims, i) => [i, claims] as const))(
    'customer seed record %i: valid on both sides',
    (_i, claims) => {
      expect(validateClaims('KYCCredential', claims)).toEqual([]);
      expect(backend.validate('KYCCredential', claims)).toEqual([]);
    },
  );

  it.each(INVALID)('%s – %s: the same issues (path, code, message)', (type, _label, claims) => {
    const portal = validateClaims(type, claims);
    expect(portal.length).toBeGreaterThan(0);
    expect(portal).toEqual(backend.validate(type, claims));
  });

  it('the portal builds its forms from the very files the backend reads', () => {
    const files = Object.fromEntries(
      (['employment-credential', 'kyc-credential'] as const).map((name) => [
        name,
        JSON.parse(
          readFileSync(join(REPO, 'docs', 'schemas', `${name}.v1.schema.json`), 'utf8'),
        ) as unknown,
      ]),
    );
    expect(schemas.EmploymentCredential).toEqual(files['employment-credential']);
    expect(schemas.KYCCredential).toEqual(files['kyc-credential']);
  });
});

describe('form generated from the schema', () => {
  const types: CredentialTypeName[] = ['EmploymentCredential', 'KYCCredential'];

  it.each(types)('%s: every schema claim is in the form or deliberately omitted', (type) => {
    const inForm = new Set(
      FORM_UI[type].flatMap((g) => g.fields.map((f) => f.path)).filter((p) => p !== EXTERNAL_REF),
    );
    const constants = schemaLeafPaths(type).filter(
      (p) => propertySchema(type, p)?.const !== undefined,
    );
    for (const path of schemaLeafPaths(type)) {
      const top = path.split('.')[0]!;
      const covered =
        inForm.has(path) || OMITTED_CLAIMS[type].includes(top) || constants.includes(path);
      expect(covered, path).toBe(true);
    }
    // ...and nothing in the form that the schema does not have
    for (const path of inForm) expect(propertySchema(type, path), path).toBeDefined();
  });

  it('server-calculated and excluded claims are not form fields', () => {
    const kycPaths = FORM_UI.KYCCredential.flatMap((g) => g.fields.map((f) => f.path));
    expect(kycPaths).not.toContain('age_over_18');
    expect(kycPaths).not.toContain('portrait');
  });

  it('input types come from the schema', () => {
    expect(inputKind('EmploymentCredential', { path: 'employment_type' })).toBe('select');
    expect(inputKind('EmploymentCredential', { path: 'date_of_joining' })).toBe('date');
    expect(inputKind('EmploymentCredential', { path: 'work_email' })).toBe('email');
    expect(inputKind('EmploymentCredential', { path: 'work_phone', input: 'tel' })).toBe('tel');
    expect(inputKind('KYCCredential', { path: 'permanent_address.district' })).toBe('select');
    expect(inputKind('KYCCredential', { path: 'full_name' })).toBe('text');
    expect(enumOptions('KYCCredential', 'permanent_address.district')).toHaveLength(25);
    expect(propertySchema('KYCCredential', 'no_such.claim')).toBeUndefined();
  });

  it('the if/then evaluator understands every if-clause the schemas use', () => {
    for (const type of types) {
      for (const rule of (schemas[type] as JsonSchema).allOf ?? []) {
        for (const keyword of Object.keys(rule.if ?? {})) {
          expect(SUPPORTED_IF_KEYWORDS as readonly string[], keyword).toContain(keyword);
        }
      }
    }
    expect(matchesIf({ properties: { a: { const: 'x' } } }, {})).toBe(true); // absent = passes
    expect(matchesIf({ properties: { a: { const: 'x' } } }, { a: 'y' })).toBe(false);
    expect(matchesIf({ required: ['a'] }, {})).toBe(false);
  });

  it('NIC vs passport vs driving licence: requirements and patterns per the allOf rules', () => {
    const required = (claims: Record<string, unknown>) => requiredPaths('KYCCredential', claims);
    expect(required({ id_document_type: 'nic' }).has('id_document_expiry')).toBe(false);
    expect(required({ id_document_type: 'passport' }).has('id_document_expiry')).toBe(true);
    expect(required({ id_document_type: 'driving_licence' }).has('id_document_expiry')).toBe(true);
    expect(required({ residential_address: {} }).has('residence_proof_type')).toBe(true);
    expect(required({ residential_address: {} }).has('residential_address.line1')).toBe(true);
    expect(required({}).has('residential_address.line1')).toBe(false);
    expect(
      activePattern('KYCCredential', 'id_document_number', { id_document_type: 'passport' }),
    ).toBe('^[A-Z][0-9]{7}$');
    expect(activePattern('EmploymentCredential', 'employee_id', {})).toBe(
      '^[A-Z0-9][A-Z0-9-]{2,19}$',
    );
  });

  it('visible fields: the expiry date and proof of residence appear only when required', () => {
    const state = initialFormState('KYCCredential');
    const paths = (s: typeof state) =>
      visibleFields('KYCCredential', s, 'customer')
        .filter((g) => !g.hidden)
        .flatMap((g) => g.fields.map((f) => f.field.path));
    expect(paths(state)).not.toContain('id_document_expiry');
    expect(paths(state)).not.toContain('residential_address.line1');
    const passport = { ...state, values: { ...state.values, id_document_type: 'passport' } };
    expect(paths(passport)).toContain('id_document_expiry');
    const residential = { ...state, objects: { residential_address: true } };
    expect(paths(residential)).toEqual(
      expect.arrayContaining(['residential_address.line1', 'residence_proof_type']),
    );
    const refField = visibleFields('KYCCredential', state, 'customer')[0]!.fields[0]!;
    expect(refField).toEqual({ field: { path: EXTERNAL_REF }, required: true });
  });

  it('toClaims trims, leaves out empty and hidden fields, and fills the address country', () => {
    const state = initialFormState('KYCCredential');
    const claims = toClaims('KYCCredential', {
      values: {
        ...state.values,
        full_name: '  Kasun Bandara ',
        id_document_expiry: '2030-01-01', // hidden for an NIC: left out
        'permanent_address.city': 'Kandy',
        'residential_address.city': 'Galle', // object switched off: left out
        residence_proof_type: 'water_bill',
      },
      objects: {},
    });
    expect(claims).toEqual({
      full_name: 'Kasun Bandara',
      id_document_type: 'nic',
      nationality: 'LK',
      permanent_address: { city: 'Kandy', country: 'LK' },
    });
    const withResidence = toClaims('KYCCredential', {
      values: { ...state.values, residence_proof_type: 'water_bill' },
      objects: { residential_address: true },
    });
    expect(withResidence).toMatchObject({
      residential_address: { country: 'LK' },
      residence_proof_type: 'water_bill',
    });
  });

  it('the form check adds the reference rule and ignores the server-calculated age', () => {
    const { age_over_18: _a, ...claims } = customer;
    expect(validateHolderForm('KYCCredential', claims, 'CUS-000123')).toEqual([]);
    expect(validateHolderForm('KYCCredential', claims, undefined)).toEqual([
      expect.objectContaining({ path: 'externalRef', code: 'required' }),
    ]);
    expect(validateHolderForm('KYCCredential', claims, 'cus 1')).toEqual([
      expect.objectContaining({ path: 'externalRef', code: 'pattern' }),
    ]);
    // Employees never send a separate reference
    expect(validateHolderForm('EmploymentCredential', employee, 'IGNORED')).toEqual([]);
  });
});

describe('server issues and messages', () => {
  it('maps server details onto form paths (claims. stripped, age onto the date of birth)', () => {
    expect(
      serverFieldIssues([
        { path: 'claims.permanent_address.city', code: 'required', message: 'is required' },
        { path: 'claims.age_over_18', message: 'is required' },
        { path: 'externalRef', code: 'pattern', message: 'x' },
        { nonsense: true },
        null,
      ]),
    ).toEqual([
      { path: 'permanent_address.city', code: 'required', message: 'is required' },
      { path: 'date_of_birth', code: 'invalid', message: 'is required' },
      { path: 'externalRef', code: 'pattern', message: 'x' },
    ]);
    expect(serverFieldIssues({ holderId: 'x' })).toEqual([]);
  });

  it('gives field-specific pattern explanations, per ID document type', () => {
    const t = i18n.t.bind(i18n);
    const exists = (key: string) => i18n.exists(key);
    const pattern = (path: string, claims: Record<string, unknown> = {}) =>
      issueMessage(t, { path, code: 'pattern', message: '' }, claims, exists);
    expect(pattern('id_document_number', { id_document_type: 'passport' })).toBe(
      'Enter one capital letter followed by 7 digits.',
    );
    expect(pattern('permanent_address.postal_code')).toBe('Enter the 5-digit postal code.');
    expect(pattern('designation')).toBe('Check the format of this value.');
    expect(issueMessage(t, { path: 'x', code: 'type', message: '' }, {}, exists)).toBe(
      'This value is not valid.',
    );
    expect(
      issueMessage(
        t,
        { path: 'x', code: 'maxLength', message: '', params: { limit: 80 } },
        {},
        exists,
      ),
    ).toBe('Enter no more than 80 characters.');
  });

  it('every form field, schema option and ID-number type has English text', () => {
    const fields = en.holders.fields as Record<string, Record<string, unknown>>;
    const options = en.holders.options as Record<string, Record<string, string>>;
    for (const type of ['EmploymentCredential', 'KYCCredential'] as const) {
      for (const path of schemaLeafPaths(type)) {
        expect(fields[fieldKey(path)]?.label, path).toBeTypeOf('string');
        const values = propertySchema(type, path)?.enum;
        if (values) {
          const name = path.split('.').pop()!;
          for (const value of values)
            expect(options[name]?.[String(value)], `${path}=${value}`).toBeTypeOf('string');
        }
      }
      for (const group of FORM_UI[type]) {
        expect((en.holders.register.groups as Record<string, string>)[group.id]).toBeTypeOf(
          'string',
        );
      }
    }
    const idHints = fields.id_document_number as { hints: object; patternErrors: object };
    for (const value of enumOptions('KYCCredential', 'id_document_type')) {
      expect(Object.keys(idHints.hints)).toContain(value);
      expect(Object.keys(idHints.patternErrors)).toContain(value);
    }
  });
});

describe('edge cases of the helpers', () => {
  it('form model: empty if-clauses, non-enum fields, unknown paths, missing values', () => {
    expect(matchesIf({}, {})).toBe(true);
    expect(enumOptions('EmploymentCredential', 'full_name')).toEqual([]);
    expect(activePattern('KYCCredential', 'full_name', {})).toBeUndefined();
    expect(propertySchema('KYCCredential', 'permanent_address.no_such_part')).toBeUndefined();
    // A state without values for the fields: only the schema constants remain
    expect(toClaims('KYCCredential', { values: {}, objects: {} })).toEqual({
      permanent_address: { country: 'LK' },
    });
    expect(toClaims('EmploymentCredential', { values: {}, objects: {} })).toEqual({});
  });

  it('messages: the ID number without a known document type uses the generic text', () => {
    const t = i18n.t.bind(i18n);
    const exists = (key: string) => i18n.exists(key);
    const issue = { path: 'id_document_number', code: 'pattern', message: '' };
    expect(issueMessage(t, issue, { id_document_type: 'library_card' }, exists)).toBe(
      'Check the format of this value.',
    );
    expect(issueMessage(t, issue, {}, exists)).toBe('Check the format of this value.');
    expect(
      issueMessage(
        t,
        { path: 'date_of_birth', code: 'format', message: '', params: { format: 'date' } },
        {},
        exists,
      ),
    ).toBe('Enter a real date.');
  });

  it('display and format helpers: unknown options and invalid dates are shown as they are', () => {
    const t = i18n.t.bind(i18n);
    const exists = (key: string) => i18n.exists(key);
    expect(optionLabel(t, 'employment_type', 'intern', exists)).toBe('intern');
    expect(optionLabel(t, 'permanent_address.district', 'Kandy', exists)).toBe('Kandy');
    expect(maskIdNumber('567V')).toBe('•••• 567V');
    expect(formatColomboDate('not a date', 'en')).toBeNull();
    expect(formatCalendarDate('soon', 'en')).toBe('soon');
    expect(formatCalendarDate('2026-13-45', 'en')).toBe('2026-13-45');
    expect(formatCalendarDate('2026-11-26', 'si')).toMatch(/2026/);
  });

  it('API helpers work without an abort signal and send only the parameters given', async () => {
    const calls: [string, unknown][] = [];
    const api: ApiClient = {
      request: async <T>(path: string, options?: unknown) => {
        calls.push([path, options]);
        if (path.startsWith('/holders?'))
          return { holders: [], total: 0, limit: 20, offset: 0 } as T;
        if (path.startsWith('/credentials?')) return { credentials: [], total: 0 } as T;
        return {
          id: 'h1',
          issuerId: 'employer-a',
          recordType: 'employee',
          credentialType: 'EmploymentCredential',
          externalRef: 'STC-1',
          fullName: 'A Person',
          claims: {},
          createdBy: null,
          createdAt: '2026-11-26T00:00:00.000Z',
          updatedAt: '2026-11-26T00:00:00.000Z',
        } as T;
      },
    };
    await fetchHolders(api, { limit: 20, offset: 0, sort: 'newest' });
    await fetchHolder(api, 'a/b');
    await fetchHolderCredentials(api, 'h1');
    await createHolder(api, { claims: { full_name: 'A Person' } });
    expect(calls).toEqual([
      ['/holders?limit=20&offset=0&sort=newest', {}],
      ['/holders/a%2Fb', {}],
      ['/credentials?holderId=h1&limit=100', {}],
      ['/holders', { method: 'POST', body: { claims: { full_name: 'A Person' } } }],
    ]);
  });
});
