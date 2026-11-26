/**
 * Plain-language wording for a credential status change in the dashboard's recent activity
 * (docs/frontend/issuer-portal.md, "Dashboard – activity wording"). Reason codes come from the
 * backend's fixed enums; an unknown code falls back to a neutral phrase, never the raw code.
 */
import type { TFunction } from 'i18next';
import type { DashboardActivity } from '../api/dashboard.js';

/** Reason codes the backend stores (REVOCATION_REASONS and REISSUE_REASONS). */
export const ACTIVITY_REASONS = [
  'details_changed',
  'employment_ended',
  'relationship_ended',
  'wallet_lost_or_compromised',
  'issued_in_error',
  'validity_extension',
  'other',
] as const;
type ActivityReason = (typeof ACTIVITY_REASONS)[number];

const isReason = (value: string | null): value is ActivityReason =>
  value !== null && (ACTIVITY_REASONS as readonly string[]).includes(value);

export function reasonLabel(reason: string | null, t: TFunction): string {
  return isReason(reason)
    ? t(`dashboard.activity.reasons.${reason}`)
    : t('dashboard.activity.reasons.unknown');
}

/** e.g. "Revoked – employment ended", "Signed into wallet", "Replaced by a new credential". */
export function activityAction(
  event: Pick<DashboardActivity, 'fromStatus' | 'toStatus' | 'reason'>,
  t: TFunction,
): string {
  const { fromStatus, toStatus, reason } = event;
  if (fromStatus === null && toStatus === 'pending') return t('dashboard.activity.actions.created');
  if (fromStatus === 'pending' && toStatus === 'valid')
    return t('dashboard.activity.actions.signed');
  if (fromStatus === 'valid' && toStatus === 'valid' && reason === 'dev_simulated_expiry') {
    return t('dashboard.activity.actions.expirySimulated');
  }
  if (toStatus === 'superseded') return t('dashboard.activity.actions.superseded');
  if (toStatus === 'revoked') {
    return t('dashboard.activity.actions.revoked', { reason: reasonLabel(reason, t) });
  }
  return t('dashboard.activity.actions.other');
}

const CREDENTIAL_TYPES = ['EmploymentCredential', 'KYCCredential'] as const;

/** "Employment credential" / "KYC credential"; an unknown type is shown as sent. */
export function credentialTypeLabel(type: string, t: TFunction): string {
  return (CREDENTIAL_TYPES as readonly string[]).includes(type)
    ? t(`credentialTypes.${type as (typeof CREDENTIAL_TYPES)[number]}`)
    : type;
}

/** First 8 characters of a credential id, e.g. "3f2a9c1b…" (the full id goes in a title). */
export const shortId = (id: string) => (id.length > 8 ? `${id.slice(0, 8)}…` : id);
