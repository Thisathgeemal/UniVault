/**
 * @univault/claims-validation – the ONE place that decides how holder claims are checked
 * against the credential JSON Schemas in docs/schemas (Decision 018).
 *
 * Used by:
 *   - the backend (services/credential-schemas.ts): compiles the schema files at start-up with
 *     createClaimsAjv() from './node';
 *   - the issuer portal: the same files are compiled AT BUILD TIME into standalone validator
 *     code (standaloneValidatorsModule() from './node', run by a Vite plugin), because the
 *     portal's Content-Security-Policy forbids eval / new Function in the browser.
 *
 * Both sides then turn Ajv's errors into the same issues with toClaimIssues(), so the browser
 * and the server report the same path, code and message for the same claims.
 *
 * This entry is browser-safe: it imports nothing at runtime (Ajv types only).
 */
import type { ErrorObject } from 'ajv';

export type { ErrorObject };

export type CredentialTypeName = 'EmploymentCredential' | 'KYCCredential';
export const CREDENTIAL_TYPES: readonly CredentialTypeName[] = [
  'EmploymentCredential',
  'KYCCredential',
];

/** File names in docs/schemas (the single source of truth for the claim rules). */
export const SCHEMA_FILES: Record<CredentialTypeName, string> = {
  EmploymentCredential: 'employment-credential.v1.schema.json',
  KYCCredential: 'kyc-credential.v1.schema.json',
};

/**
 * Ajv options shared by every validator (backend runtime and portal build). Changing one of
 * them changes what both sides accept.
 */
export const AJV_OPTIONS = { allErrors: true, strict: true, strictRequired: false } as const;

/** The custom keyword in the schema files (metadata only; it never fails validation). */
export const CUSTOM_KEYWORDS = ['x-univault'] as const;

/**
 * A stable, machine-readable reason. The portal translates it (en / si); the backend sends it
 * next to the English message in VALIDATION_ERROR details for holder records.
 */
export type ClaimIssueCode =
  | 'required'
  | 'notAllowed'
  | 'poBox'
  | 'notAccepted'
  | 'pattern'
  | 'format'
  | 'minLength'
  | 'maxLength'
  | 'enum'
  | 'const'
  | 'type'
  | 'mismatch'
  | 'invalid';

export interface ClaimIssue {
  /** Dotted path inside the claims, e.g. "permanent_address.line1" ("(claims)" = the object). */
  path: string;
  code: ClaimIssueCode;
  /** English message (the backend's API text). */
  message: string;
  /** e.g. { limit: 80 } for minLength / maxLength, { format: 'date' } for format. */
  params?: Record<string, unknown>;
}

const KEYWORD_CODES: Partial<Record<string, ClaimIssueCode>> = {
  pattern: 'pattern',
  format: 'format',
  minLength: 'minLength',
  maxLength: 'maxLength',
  enum: 'enum',
  const: 'const',
  type: 'type',
};

/** One Ajv error as an issue, with the backend's friendly messages. */
export function toClaimIssue(error: ErrorObject): ClaimIssue {
  const base = error.instancePath.replace(/^\//, '').replace(/\//g, '.');
  if (error.keyword === 'required') {
    const missing = (error.params as { missingProperty: string }).missingProperty;
    return {
      path: base ? `${base}.${missing}` : missing,
      code: 'required',
      message: 'is required',
    };
  }
  if (error.keyword === 'additionalProperties') {
    const extra = (error.params as { additionalProperty: string }).additionalProperty;
    return {
      path: base ? `${base}.${extra}` : extra,
      code: 'notAllowed',
      message: 'is not allowed by the credential schema',
    };
  }
  if (error.keyword === 'not' && base.endsWith('line1')) {
    return {
      path: base,
      code: 'poBox',
      message: 'must be a street address (P.O. Box addresses are not accepted)',
    };
  }
  if (error.keyword === 'not') {
    return { path: base || '(claims)', code: 'notAccepted', message: 'is not an accepted value' };
  }
  const params: Record<string, unknown> = {};
  if (error.keyword === 'minLength' || error.keyword === 'maxLength') {
    params.limit = (error.params as { limit: number }).limit;
  }
  if (error.keyword === 'format') params.format = (error.params as { format: string }).format;
  return {
    path: base || '(claims)',
    code: KEYWORD_CODES[error.keyword] ?? 'invalid',
    message: error.message ?? 'is invalid',
    ...(Object.keys(params).length > 0 ? { params } : {}),
  };
}

/**
 * All of a validator's errors as issues: each path + message once (Ajv can report the same
 * problem twice, e.g. via allOf), without the if/then summary line ("must match "then"
 * schema"), whose real cause is reported separately.
 */
export function toClaimIssues(errors: readonly ErrorObject[] | null | undefined): ClaimIssue[] {
  const seen = new Set<string>();
  return (errors ?? [])
    .filter((e) => e.keyword !== 'if')
    .map(toClaimIssue)
    .filter((issue) => {
      const key = `${issue.path}|${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ---------------------------------------------------------------------------
// Holder reference (externalRef) – not part of the credential, so not in the schema files

export type RecordType = 'employee' | 'customer';

/** A bank's customer number: 3–30 uppercase letters, digits or hyphens, starting with no hyphen. */
export const CUSTOMER_REF_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,29}$/;

/** A reference issue, with the path "externalRef" (outside the claims). */
export interface ReferenceIssue extends Omit<ClaimIssue, 'path'> {
  path: 'externalRef';
}

/**
 * The reference rule of POST /holders, shared so the portal says the same as the server:
 *   - employee: the reference IS claims.employee_id; a different externalRef is refused;
 *   - customer: externalRef (the bank's customer number) is required and must match
 *     CUSTOMER_REF_PATTERN.
 * Returns the reference to store (undefined when it cannot be determined) and the issues.
 */
export function checkExternalRef(
  recordType: RecordType,
  externalRef: string | undefined,
  claims: Record<string, unknown>,
): { externalRef: string | undefined; issues: ReferenceIssue[] } {
  if (recordType === 'employee') {
    const ref = typeof claims.employee_id === 'string' ? claims.employee_id : undefined;
    const issues: ReferenceIssue[] =
      externalRef !== undefined && externalRef !== ref
        ? [
            {
              path: 'externalRef',
              code: 'mismatch',
              message: 'must equal claims.employee_id for employee records',
            },
          ]
        : [];
    return { externalRef: ref, issues };
  }
  if (!externalRef) {
    return {
      externalRef: undefined,
      issues: [
        {
          path: 'externalRef',
          code: 'required',
          message: 'is required for bank customer records (customer number)',
        },
      ],
    };
  }
  if (!CUSTOMER_REF_PATTERN.test(externalRef)) {
    return {
      externalRef,
      issues: [
        {
          path: 'externalRef',
          code: 'pattern',
          message: 'must be 3–30 uppercase letters, digits or hyphens',
        },
      ],
    };
  }
  return { externalRef, issues: [] };
}
