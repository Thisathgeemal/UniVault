/**
 * Plain-language messages for a refused revoke or reissue (another staff member was quicker,
 * or the credential changed meanwhile). After any of them the page refreshes its data.
 */
import type { TFunction } from 'i18next';
import { ApiError } from '../api/errors.js';
import { apiErrorMessage } from '../lib/api-errors.js';

const CONFLICT_KEYS: Record<string, string> = {
  CREDENTIAL_ALREADY_REVOKED: 'credentials.conflicts.alreadyRevoked',
  CREDENTIAL_SUPERSEDED: 'credentials.conflicts.superseded',
  CREDENTIAL_NOT_REISSUABLE: 'credentials.conflicts.notReissuable',
  ACTIVE_CREDENTIAL_EXISTS: 'credentials.conflicts.activeExists',
  HOLDER_DATA_INVALID: 'credentials.conflicts.holderDataInvalid',
  ISSUER_KEY_MISSING: 'credentials.conflicts.keyMissing',
  ISSUER_KEY_UNAVAILABLE: 'credentials.conflicts.keyMissing',
  CREDENTIAL_NOT_FOUND: 'credentials.conflicts.notFound',
  FORBIDDEN: 'credentials.conflicts.forbidden',
};

/** True when the data on screen is out of date and must be reloaded. */
export const isConflict = (error: unknown) =>
  error instanceof ApiError && (error.status === 409 || error.status === 404);

export function actionErrorMessage(
  t: TFunction,
  error: unknown,
): { message: string; reference?: string } {
  const key = error instanceof ApiError ? CONFLICT_KEYS[error.code] : undefined;
  return key ? { message: t(key as never) } : apiErrorMessage(error, t);
}
