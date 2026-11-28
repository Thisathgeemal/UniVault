import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Icon } from '../components/Icon';
import { useTheme } from '../theme/use-theme';
import type { BiometricKind } from './biometrics';

/**
 * The platform limitation, said plainly wherever biometric unlock is turned on (setup step,
 * Settings → Security): the phone only reports that SOME enrolled biometric matched, never whose,
 * so anyone whose fingerprint / face is saved on the phone could unlock UniVault
 * (docs/security/wallet-authentication.md, Known limitations). A brand-soft panel with body text
 * (text on brand-soft) and a decorative icon.
 */
export function SharedBiometricNotice({ biometric }: { biometric: BiometricKind }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View
      testID="biometric-shared-notice"
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.brandSoft,
          borderRadius: theme.radius.md,
          padding: theme.space(3),
          gap: theme.space(3),
        },
      ]}
    >
      <Icon name="people-outline" color={theme.colors.accentTextOnSoft} />
      <AppText style={styles.text}>{t(`biometrics.sharedNotice.${biometric}`)}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { flex: 1, flexShrink: 1 },
});
