import { useTranslation } from 'react-i18next';
import { STATUS_PRESENTATION, type WalletStatus } from '../credentials/status';
import { Badge } from './Badge';

export interface StatusBadgeProps {
  status: WalletStatus;
  testID?: string;
}

/**
 * A credential's status: icon + translated word (the same words as the issuer portal's badge; a
 * test compares them) in its status colour set's pill. Map backend values with
 * walletStatusFromBackend().
 */
export function StatusBadge({ status, testID }: StatusBadgeProps) {
  const { t } = useTranslation();
  const { set, icon } = STATUS_PRESENTATION[status];
  return (
    <Badge
      label={t(`status.${status}`)}
      tone={set}
      icon={icon}
      testID={testID ?? `status-${status}`}
    />
  );
}
