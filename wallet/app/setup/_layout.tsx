/**
 * Security setup, after onboarding and before the wallet (the PIN and biometric task fills it).
 *
 * GATE: only while onboarding is complete and security setup is not (src/onboarding/gate.ts):
 * before onboarding it sends the holder to onboarding; once setup is done, to the tabs. There
 * is no way from here into the tabs other than completing setup.
 */
import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions } from '../../src/navigation/stack-options';
import { useGateRedirect } from '../../src/onboarding/SetupProvider';

export const unstable_settings = { anchor: 'security' };

export default function SetupLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  const redirect = useGateRedirect('setup');
  if (redirect) return <Redirect href={redirect} />;
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="security" options={{ title: t('setup.title') }} />
      <Stack.Screen name="biometrics" options={{ title: t('setup.title') }} />
    </Stack>
  );
}
