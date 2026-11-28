import { useTranslation } from 'react-i18next';
import { AppText, Card, ChoiceList, Screen, useToast } from '../../../src/components';
import { APPEARANCE_PREFERENCES, type AppearancePreference } from '../../../src/lib/preferences';
import { useAppearance } from '../../../src/theme/appearance';

/**
 * Appearance: "Use device setting" (default), "Light" or "Dark" as a radio group. The choice
 * changes the whole app at once (src/theme/appearance.tsx) and is saved (AsyncStorage,
 * preference only) so the next start opens in it.
 */
export default function AppearanceScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { preference, setPreference } = useAppearance();

  const choose = async (value: AppearancePreference) => {
    if (value === preference) return;
    const saved = await setPreference(value);
    toast.show({
      message: saved ? t('settings.appearanceSaved') : t('settings.appearanceNotSaved'),
      tone: saved ? 'success' : 'danger',
    });
  };

  return (
    <Screen testID="appearance-screen">
      <AppText tone="muted">{t('settings.appearanceHint')}</AppText>
      <Card>
        <ChoiceList
          choices={APPEARANCE_PREFERENCES.map((value) => ({
            value,
            label: t(`appearance.${value}`),
            testID: `appearance-${value}`,
          }))}
          selected={preference}
          onSelect={(value) => void choose(value)}
        />
      </Card>
    </Screen>
  );
}
