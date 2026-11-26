import { StatusBadge } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import type { EffectiveStatus } from '../api/credentials.js';
import { STATUS_TONES } from '../holders/display.js';

/** The effective status in plain words: Active, Awaiting wallet, Revoked, Replaced, Expired. */
export function CredentialStatusBadge({ status }: { status: EffectiveStatus }) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={STATUS_TONES[status]}>{t(`credentials.statuses.${status}`)}</StatusBadge>
  );
}
