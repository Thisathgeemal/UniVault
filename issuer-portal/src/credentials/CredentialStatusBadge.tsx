import { StatusBadge } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import type { EffectiveStatus } from '../api/credentials.js';
import { STATUS_PRESENTATION } from './status.js';

/** The effective status as icon + word in its status colour set (credentials/status.ts). */
export function CredentialStatusBadge({ status }: { status: EffectiveStatus }) {
  const { t } = useTranslation();
  const { set, icon } = STATUS_PRESENTATION[status];
  return (
    <StatusBadge status={set} icon={icon}>
      {t(`credentials.statuses.${status}`)}
    </StatusBadge>
  );
}
