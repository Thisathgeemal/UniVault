import { useTranslation } from 'react-i18next';
import { AppText, Card, ChoiceList, Screen, useToast } from '../../../src/components';
import { LOCK_DELAYS, type LockDelay } from '../../../src/lib/preferences';
import { useLock } from '../../../src/security/app-lock';

/**
 * Settings → Security → "Lock after leaving the app": Immediately (default), 30 seconds, 1 minute,
 * 5 minutes. Applies at once and is saved as a non-secret preference (univault.lockDelay).
 */
export default function LockDelayScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { delay, setDelay } = useLock();

  const choose = async (value: LockDelay) => {
    if (value === delay) return;
    const saved = await setDelay(value);
    toast.show({
      message: saved ? t('lockDelay.saved') : t('lockDelay.notSaved'),
      tone: saved ? 'success' : 'danger',
    });
  };

  return (
    <Screen testID="lock-delay-screen">
      <AppText tone="muted">{t('lockDelay.hint')}</AppText>
      <Card>
        <ChoiceList
          choices={LOCK_DELAYS.map((value) => ({
            value,
            label: t(`lockDelay.options.${value}`),
            testID: `lock-delay-${value}`,
          }))}
          selected={delay}
          onSelect={(value) => void choose(value)}
        />
      </Card>
    </Screen>
  );
}
