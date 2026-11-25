/**
 * Plain-language sign-in messages per backend error code (docs/frontend/issuer-portal.md,
 * "Error messages"). INVALID_CREDENTIALS never says which field was wrong.
 */
import type { TFunction } from 'i18next';
import { ApiError, NETWORK_ERROR } from '../api/errors.js';
import { formatColomboDateTime } from './format.js';

export interface LoginErrorMessage {
  message: string;
  /** Shown for unexpected errors so support can find the request in the server log. */
  reference?: string;
}

export function loginErrorMessage(
  error: unknown,
  t: TFunction,
  language: string,
): LoginErrorMessage {
  if (!(error instanceof ApiError)) return { message: t('errors.generic') };
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return { message: t('login.errors.invalidCredentials') };
    case 'ACCOUNT_LOCKED': {
      const lockedUntil = (error.details as { lockedUntil?: unknown } | undefined)?.lockedUntil;
      const time =
        typeof lockedUntil === 'string' ? formatColomboDateTime(lockedUntil, language) : null;
      return {
        message: time
          ? t('login.errors.accountLockedUntil', { time })
          : t('login.errors.accountLocked'),
      };
    }
    case 'RATE_LIMITED':
      return { message: t('login.errors.rateLimited') };
    case 'VALIDATION_ERROR':
      return { message: t('login.errors.validation') };
    case NETWORK_ERROR:
      return { message: t('errors.network') };
    default:
      if (error.status === 429) return { message: t('login.errors.rateLimited') };
      return {
        message: t('errors.generic'),
        ...(error.requestId
          ? { reference: t('common.reference', { requestId: error.requestId }) }
          : {}),
      };
  }
}
