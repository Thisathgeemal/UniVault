/**
 * Plain-language sign-in messages per backend error code (docs/frontend/issuer-portal.md,
 * "Error messages"). INVALID_CREDENTIALS never says which field was wrong.
 */
import type { TFunction } from 'i18next';
import { ApiError } from '../api/errors.js';
import { apiErrorMessage, type ApiErrorMessage } from './api-errors.js';
import { formatColomboDateTime } from './format.js';

export type LoginErrorMessage = ApiErrorMessage;

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
    default:
      // Sign-in keeps its own rate-limit wording; network and unexpected errors are shared
      if (error.status === 429) return { message: t('login.errors.rateLimited') };
      return apiErrorMessage(error, t);
  }
}
