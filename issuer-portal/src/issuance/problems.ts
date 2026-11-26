/**
 * What went wrong with a preview or an issuance, in the terms the page explains to staff.
 * The backend raises the same errors for both (one issuance path, Decision 019).
 */
import { ApiError, NETWORK_ERROR } from '../api/errors.js';

export type IssuanceProblem =
  /** 409: a pending or valid credential of this type exists (details.credentialId). */
  | { kind: 'activeExists'; credentialId: string | null }
  /** 422: the stored holder record fails the schema or its ID document expired. */
  | { kind: 'holderInvalid' }
  /** 409 ISSUER_KEY_MISSING or 503 ISSUER_KEY_UNAVAILABLE: only an administrator can fix it. */
  | { kind: 'keyUnavailable' }
  /** 404: unknown holder, or another issuer's. */
  | { kind: 'holderNotFound' }
  /** 400 on validUntil (e.g. the allowed range changed). */
  | { kind: 'validUntil' }
  | { kind: 'network' }
  | { kind: 'other'; error: unknown };

export function issuanceProblem(error: unknown): IssuanceProblem {
  if (!(error instanceof ApiError)) return { kind: 'other', error };
  switch (error.code) {
    case 'ACTIVE_CREDENTIAL_EXISTS': {
      const id = (error.details as { credentialId?: unknown } | undefined)?.credentialId;
      return { kind: 'activeExists', credentialId: typeof id === 'string' ? id : null };
    }
    case 'HOLDER_DATA_INVALID':
      return { kind: 'holderInvalid' };
    case 'ISSUER_KEY_MISSING':
    case 'ISSUER_KEY_UNAVAILABLE':
      return { kind: 'keyUnavailable' };
    case 'HOLDER_NOT_FOUND':
      return { kind: 'holderNotFound' };
    case NETWORK_ERROR:
      return { kind: 'network' };
    case 'VALIDATION_ERROR': {
      const paths = Array.isArray(error.details)
        ? error.details.map((d) => (d as { path?: unknown }).path)
        : [];
      return paths.includes('validUntil') ? { kind: 'validUntil' } : { kind: 'other', error };
    }
    default:
      return { kind: 'other', error };
  }
}
