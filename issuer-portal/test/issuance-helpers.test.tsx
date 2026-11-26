/**
 * The issuance helpers on their own: API calls (bodies, no signal), the mapping of API errors
 * to the page's problems, how preview claims are grouped and formatted, the cap explanations,
 * and the holder picker's empty and error states.
 */
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../src/api/client.js';
import {
  fetchCredential,
  fetchCredentialSchemas,
  issueCredential,
  previewCredential,
  type CredentialPreview,
} from '../src/api/credentials.js';
import { ApiError, networkError } from '../src/api/errors.js';
import { i18n } from '../src/i18n/index.js';
import {
  capExplanation,
  claimLabel,
  formatClaimValue,
  groupPreviewClaims,
} from '../src/issuance/claim-display.js';
import { issuanceProblem } from '../src/issuance/problems.js';
import { ADMIN, API, errorBody, mockSchemaResponse, server } from './mock-backend.js';
import { renderApp } from './render-app.js';

const t = i18n.t.bind(i18n);
const exists = (key: string) => i18n.exists(key);

const METADATA = {
  id: 'c1',
  holder: { id: 'h1', externalRef: 'STC-1', fullName: 'A Person' },
  credentialType: 'EmploymentCredential',
  status: 'pending',
  effectiveStatus: 'pending',
  issuedAt: null,
  expiresAt: '2027-11-26T04:30:00.000Z',
  createdAt: '2026-11-26T04:30:00.000Z',
};

describe('API helpers', () => {
  it('send only holderId, type and validUntil (never claims), with or without a signal', async () => {
    const calls: [string, unknown][] = [];
    const preview = {
      credentialType: 'EmploymentCredential',
      vct: 'v',
      schemaVersion: '1.0',
      issuer: { id: 'i', name: 'I' },
      holder: { id: 'h1', externalRef: 'STC-1', fullName: 'A Person' },
      alwaysVisible: {},
      disclosable: [],
      derived: [],
      expiry: {
        expiresAt: 'x',
        defaultExpiresAt: 'x',
        cappedBy: null,
        validUntilRange: { min: 'a', max: 'b' },
      },
      warnings: [],
    };
    const api: ApiClient = {
      request: async <T,>(path: string, options?: unknown) => {
        calls.push([path, options]);
        if (path === '/credential-schemas')
          return { schemas: [mockSchemaResponse('KYCCredential')] } as T;
        if (path === '/credentials/preview') return preview as T;
        return METADATA as T;
      },
    };
    expect(await fetchCredentialSchemas(api)).toHaveLength(1);
    await previewCredential(api, { holderId: 'h1', credentialType: 'EmploymentCredential' });
    await issueCredential(api, {
      holderId: 'h1',
      credentialType: 'EmploymentCredential',
      validUntil: '2027-01-01',
    });
    await fetchCredential(api, 'c/1');
    expect(calls).toEqual([
      ['/credential-schemas', {}],
      [
        '/credentials/preview',
        { method: 'POST', body: { holderId: 'h1', credentialType: 'EmploymentCredential' } },
      ],
      [
        '/credentials',
        {
          method: 'POST',
          body: {
            holderId: 'h1',
            credentialType: 'EmploymentCredential',
            validUntil: '2027-01-01',
          },
        },
      ],
      ['/credentials/c%2F1', {}],
    ]);
  });
});

describe('issuanceProblem', () => {
  const apiError = (code: string, details?: unknown) =>
    new ApiError({ status: 400, code, message: 'x', details });

  it('maps every code the flow explains', () => {
    expect(issuanceProblem(apiError('ACTIVE_CREDENTIAL_EXISTS', { credentialId: 'c9' }))).toEqual({
      kind: 'activeExists',
      credentialId: 'c9',
    });
    expect(issuanceProblem(apiError('ACTIVE_CREDENTIAL_EXISTS'))).toEqual({
      kind: 'activeExists',
      credentialId: null,
    });
    expect(issuanceProblem(apiError('HOLDER_DATA_INVALID')).kind).toBe('holderInvalid');
    expect(issuanceProblem(apiError('ISSUER_KEY_MISSING')).kind).toBe('keyUnavailable');
    expect(issuanceProblem(apiError('ISSUER_KEY_UNAVAILABLE')).kind).toBe('keyUnavailable');
    expect(issuanceProblem(apiError('HOLDER_NOT_FOUND')).kind).toBe('holderNotFound');
    expect(issuanceProblem(networkError()).kind).toBe('network');
    expect(
      issuanceProblem(apiError('VALIDATION_ERROR', [{ path: 'validUntil', message: 'x' }])).kind,
    ).toBe('validUntil');
  });

  it('anything else is "other" (shown with the request reference)', () => {
    expect(issuanceProblem(apiError('VALIDATION_ERROR', [{ path: 'holderId' }])).kind).toBe(
      'other',
    );
    expect(issuanceProblem(apiError('VALIDATION_ERROR', { not: 'an array' })).kind).toBe('other');
    expect(issuanceProblem(apiError('INTERNAL_ERROR')).kind).toBe('other');
    expect(issuanceProblem(new Error('boom')).kind).toBe('other');
  });
});

describe('claim display', () => {
  const preview: Pick<CredentialPreview, 'disclosable' | 'derived'> = {
    disclosable: [
      { name: 'full_name', value: 'Kasun' },
      {
        name: 'permanent_address',
        value: {
          line1: 'No. 12, Temple Road',
          city: 'Kandy',
          district: 'Nuwara Eliya',
          postal_code: '20000',
          country: 'LK',
        },
      },
      { name: 'portrait', value: 'data:image/jpeg;base64,AAAA' },
      { name: 'unknown_claim', value: 'x' },
    ],
    derived: [{ name: 'age_over_18', value: false }],
  };

  it('groups claims like the holder form, derived ones next to their source, the rest in "other"', () => {
    const groups = groupPreviewClaims('KYCCredential', preview);
    expect(groups.map((g) => [g.id, g.claims.map((c) => c.name)])).toEqual([
      ['personal', ['full_name', 'age_over_18']],
      ['permanentAddress', ['permanent_address']],
      ['other', ['portrait', 'unknown_claim']],
    ]);
  });

  it('formats addresses, booleans, the photo and plain text; labels objects like their group', () => {
    const address = preview.disclosable[1]!.value;
    expect(formatClaimValue(t, 'KYCCredential', 'permanent_address', address, 'en', exists)).toBe(
      'No. 12, Temple Road, Kandy, Nuwara Eliya, 20000',
    );
    expect(formatClaimValue(t, 'KYCCredential', 'age_over_18', false, 'en', exists)).toBe('No');
    expect(formatClaimValue(t, 'KYCCredential', 'portrait', 'data:…', 'en', exists)).toBe(
      'Photograph on record',
    );
    expect(formatClaimValue(t, 'KYCCredential', 'unknown_claim', 42, 'en', exists)).toBe('42');
    expect(claimLabel(t, 'permanent_address')).toBe('Permanent address');
    expect(claimLabel(t, 'residential_address')).toBe('Residential address');
    expect(claimLabel(t, 'age_over_18')).toBe('Over 18');
  });

  it('explains caps; no cap is no text', () => {
    const expiry = (cappedBy: CredentialPreview['expiry']['cappedBy']) => ({
      expiry: {
        expiresAt: '',
        defaultExpiresAt: '',
        cappedBy,
        validUntilRange: { min: '', max: '' },
      },
      disclosable: [],
    });
    expect(capExplanation(t, expiry(null))).toBeNull();
    expect(capExplanation(t, expiry('id_document_expiry'))).toBe(
      "Limited to the ID document's expiry date.",
    );
    expect(capExplanation(t, expiry('validUntil'))).toBe('Ends on the date you chose.');
  });
});

describe('holder picker states', () => {
  it('no match', async () => {
    server.use(
      http.get(`${API}/holders`, () =>
        HttpResponse.json({ holders: [], total: 0, limit: 10, offset: 0 }),
      ),
    );
    renderApp('/credentials/new', { signedInAs: ADMIN });
    expect(await screen.findByText('No holders match “”.')).toBeInTheDocument();
  });

  it('shows a message when the holders cannot be loaded', async () => {
    server.use(
      http.get(`${API}/holders`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'x'), { status: 500 }),
      ),
    );
    renderApp('/credentials/new', { signedInAs: ADMIN });
    expect(await screen.findByRole('alert')).toHaveTextContent('The holders could not be loaded.');
  });
});
