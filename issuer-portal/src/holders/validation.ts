/**
 * Holder validation in the browser: the SAME schema files and Ajv configuration as the backend
 * (precompiled at build time) and the same issue mapping and reference rule
 * (@univault/claims-validation), so the portal and POST /holders report the same problems.
 * A test runs the same samples through this and the backend validator and compares them.
 */
import {
  checkExternalRef,
  toClaimIssues,
  type ClaimIssue,
  type ClaimIssueCode,
  type CredentialTypeName,
} from '@univault/claims-validation';
import type { TFunction } from 'i18next';
import { validators } from 'virtual:claims-validators';
import { EXTERNAL_REF, RECORD_TYPE_OF } from './form-model.js';

/** The portal validator: claims against the credential schema, issues exactly as the backend. */
export function validateClaims(type: CredentialTypeName, claims: unknown): ClaimIssue[] {
  const validate = validators[type];
  return validate(claims) ? [] : toClaimIssues(validate.errors);
}

/** A problem with a form field (or with no field: path not in the form). */
export interface FieldIssue {
  /** Claim path ("permanent_address.city") or "externalRef". */
  path: string;
  code: ClaimIssueCode | string;
  message: string;
  params?: Record<string, unknown>;
}

/** age_over_18 is the server's: an issue with it is shown on the date of birth. */
const DERIVED_TO_FIELD: Record<string, string> = { age_over_18: 'date_of_birth' };

/**
 * Everything wrong with the form before it is sent: the schema issues (with a placeholder for
 * the server-calculated age_over_18, which the form never asks for) and the reference rule.
 */
export function validateHolderForm(
  type: CredentialTypeName,
  claims: Record<string, unknown>,
  externalRef: string | undefined,
): FieldIssue[] {
  const withDerived = type === 'KYCCredential' ? { ...claims, age_over_18: true } : claims;
  const recordType = RECORD_TYPE_OF[type];
  const reference = checkExternalRef(
    recordType,
    recordType === 'customer' ? externalRef : undefined,
    claims,
  );
  return [...validateClaims(type, withDerived), ...reference.issues];
}

/**
 * The backend's VALIDATION_ERROR details as field issues: "claims." is stripped so the paths
 * match the form's; anything else keeps its path (and ends up in the error summary only).
 */
export function serverFieldIssues(details: unknown): FieldIssue[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((d): FieldIssue[] => {
    if (!d || typeof d !== 'object') return [];
    const { path, code, message } = d as { path?: unknown; code?: unknown; message?: unknown };
    if (typeof path !== 'string') return [];
    const claimPath = path.startsWith('claims.') ? path.slice('claims.'.length) : path;
    return [
      {
        path: DERIVED_TO_FIELD[claimPath] ?? claimPath,
        code: typeof code === 'string' ? code : 'invalid',
        message: typeof message === 'string' ? message : '',
      },
    ];
  });
}

/** i18n key of a field: address parts share one set of labels ("address_city"). */
export function fieldKey(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? `address_${parts[parts.length - 1]}` : path;
}

/** t() with a key built at runtime (the keys are checked by a test against en.ts). */
export const tKey = (t: TFunction, key: string, options?: Record<string, unknown>): string =>
  (t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, options);

export const fieldLabel = (t: TFunction, path: string) =>
  path === EXTERNAL_REF
    ? tKey(t, 'holders.fields.externalRef.label')
    : tKey(t, `holders.fields.${fieldKey(path)}.label`);

/**
 * The message for an issue, in the user's language. Pattern problems get the field's own
 * explanation (for the ID number: per document type).
 */
export function issueMessage(
  t: TFunction,
  issue: FieldIssue,
  claims: Record<string, unknown>,
  exists: (key: string) => boolean,
): string {
  const key = fieldKey(issue.path);
  if (issue.code === 'pattern') {
    if (issue.path === 'id_document_number' && typeof claims.id_document_type === 'string') {
      const perType = `holders.fields.id_document_number.patternErrors.${claims.id_document_type}`;
      if (exists(perType)) return tKey(t, perType);
    }
    const own = `holders.fields.${key}.patternError`;
    if (exists(own)) return tKey(t, own);
  }
  if (issue.code === 'required' && issue.path === EXTERNAL_REF) {
    return tKey(t, 'holders.fields.externalRef.requiredError');
  }
  if (issue.code === 'format' && issue.params?.format === 'email') {
    return tKey(t, 'holders.errors.email');
  }
  const generic = `holders.errors.${issue.code}`;
  if (exists(generic)) return tKey(t, generic, issue.params);
  return tKey(t, 'holders.errors.invalid');
}
