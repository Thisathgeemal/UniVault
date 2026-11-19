/** Hash algorithm for disclosure digests (`_sd_alg`). */
export const SD_HASH_ALG = 'sha-256' as const;

/** JOSE `typ` header for SD-JWT VC credentials. */
export const SD_JWT_VC_TYP = 'dc+sd-jwt' as const;

/** Salt size in bytes (128 bits, as recommended by the SD-JWT specification). */
export const SALT_BYTES = 16;

/**
 * Envelope claims that must always stay visible and can never be selectively
 * disclosable (docs/schemas/credential-schemas.md §3). The first six are also
 * required to be plain claims by the SD-JWT VC specification.
 */
export const NON_DISCLOSABLE_CLAIMS: readonly string[] = [
  'iss',
  'nbf',
  'exp',
  'cnf',
  'vct',
  'status',
  'iat',
  'jti',
  'sub',
  'issuer_name',
  'schema_version',
  'kyc_verification_date',
];
