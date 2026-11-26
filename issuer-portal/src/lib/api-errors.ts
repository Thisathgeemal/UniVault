/**
 * Plain-language message for a failed API call that has no page-specific wording: offline,
 * rate limited, or anything unexpected (with the request reference for support). Pages map
 * their own codes first (e.g. login-errors.ts) and fall back to this.
 */
import type { TFunction } from 'i18next';
import { ApiError, NETWORK_ERROR } from '../api/errors.js';

export interface ApiErrorMessage {
  message: string;
  /** Shown for unexpected errors so support can find the request in the server log. */
  reference?: string;
}

export function apiErrorMessage(error: unknown, t: TFunction): ApiErrorMessage {
  if (!(error instanceof ApiError)) return { message: t('errors.generic') };
  if (error.code === NETWORK_ERROR) return { message: t('errors.network') };
  if (error.status === 429) return { message: t('errors.rateLimited') };
  return {
    message: t('errors.generic'),
    ...(error.requestId
      ? { reference: t('common.reference', { requestId: error.requestId }) }
      : {}),
  };
}
