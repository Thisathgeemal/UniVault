/**
 * Onboarding (first start): language → welcome → how it works → you choose what to share →
 * your wallet is protected → your privacy (src/onboarding/steps.ts). Each step draws its own
 * frame (OnboardingStep: Back / Next, Skip, progress); only "Privacy details" has the shared
 * header. The native swipe-back gesture is off: OnboardingStep handles swipes and Android's
 * back button itself, so they always go to the previous STEP.
 *
 * GATE: only while onboarding is not complete (src/onboarding/gate.ts). Once the holder ticks
 * "I understand" and taps "Set up security", the gate sends them on to /setup/security.
 */
import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStackScreenOptions } from '../../src/navigation/stack-options';
import { useGateRedirect } from '../../src/onboarding/SetupProvider';

/** A deep link to a later step still has the first step underneath. */
export const unstable_settings = { anchor: 'language' };

const STEP_FILES = [
  'language',
  'welcome',
  'how-it-works',
  'selective-disclosure',
  'security',
  'privacy',
] as const;

export default function OnboardingLayout() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  const redirect = useGateRedirect('onboarding');
  if (redirect) return <Redirect href={redirect} />;
  return (
    <Stack screenOptions={{ ...screenOptions, headerShown: false, gestureEnabled: false }}>
      {STEP_FILES.map((name) => (
        <Stack.Screen key={name} name={name} />
      ))}
      <Stack.Screen
        name="privacy-details"
        options={{ headerShown: true, title: t('onboarding.privacyDetails.title') }}
      />
    </Stack>
  );
}
