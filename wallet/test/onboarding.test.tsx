/**
 * Onboarding and the gate (src/onboarding, app/onboarding, app/setup) on the REAL app/ tree:
 * - the gate: first start → onboarding; onboarded without security → setup; both → tabs; typed
 *   URLs and deep links redirected the same way; a new privacy text version re-runs onboarding;
 * - every step renders in English and Sinhala; Next / Back / swipe / Skip; Skip never passes
 *   Privacy; "I understand" is required; the acknowledgement is stored with date and version;
 * - Android back (exit on the first step, previous step after it); "Step X of Y" for screen
 *   readers; reduce motion; dark theme and large-text-safe layout; one primary per step;
 * - security-setup placeholder (dev only) and Diagnostics → Reset onboarding (dev only).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  act,
  fireEvent,
  renderHook,
  screen,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessibilityInfo, BackHandler, StyleSheet } from 'react-native';
import { ConfirmDialog } from '../src/components';
import * as appInfo from '../src/config/app-info';
import { i18n } from '../src/i18n';
import { en, type Messages } from '../src/i18n/locales/en';
import { si } from '../src/i18n/locales/si';
import { FLAG_TRUE, PREFERENCE_KEYS, saveAppearancePreference } from '../src/lib/preferences';
import { ROUTES } from '../src/navigation/routes';
import { useStackScreenOptions } from '../src/navigation/stack-options';
import {
  gateRedirect,
  INITIAL_SETUP_STATE,
  isOnboardingComplete,
  PRIVACY_POLICY_VERSION,
  requiredArea,
} from '../src/onboarding/gate';
import {
  canSkip,
  nextStep,
  ONBOARDING_STEPS,
  previousStep,
  SKIP_TARGET,
  STEP_COUNT,
  stepNumber,
  type OnboardingStepId,
} from '../src/onboarding/steps';
import { darkColors, lightColors } from '../src/theme';
import { useSetup } from '../src/onboarding/SetupProvider';
import { renderWithProviders } from './render';
import { PIN_ATTEMPTS_KEY, PIN_VERIFIER_KEY } from '../src/security/pin';
import {
  ACKNOWLEDGED,
  freshInstall,
  secureStore,
  seedOnboardedWithoutSecurity,
} from './setup-state';

const APP_DIR = join(__dirname, '..', 'app');
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const multiSet = AsyncStorage.multiSet as jest.Mock;
const multiRemove = AsyncStorage.multiRemove as jest.Mock;

async function openApp(url: string) {
  await renderRouter(APP_DIR, { initialUrl: url });
}

/** Simulated Android back button (as in navigation.test.tsx): newest listener first. */
type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
function installBackHandler() {
  const listeners: BackListener[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'hardwareBackPress') listeners.push(listener);
    return {
      remove: () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
  });
  const exitApp = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
  const pressBack = async (): Promise<boolean> => {
    let handled = false;
    await act(async () => {
      handled = [...listeners]
        .reverse()
        .some((listener) => listener({} as Parameters<BackListener>[0]) === true);
    });
    return handled;
  };
  return { pressBack, exitApp };
}

/** A horizontal (or other) finger movement across a step. */
async function swipe(step: OnboardingStepId, dx: number, dy = 0) {
  const target = screen.getByTestId(`onboarding-${step}`);
  await fireEvent(target, 'touchStart', { nativeEvent: { pageX: 200, pageY: 400 } });
  await fireEvent(target, 'touchEnd', { nativeEvent: { pageX: 200 + dx, pageY: 400 + dy } });
}

const TITLES: Record<OnboardingStepId, (m: Messages) => string> = {
  language: (m) => m.onboarding.language.title,
  welcome: (m) => m.onboarding.welcome.title,
  howItWorks: (m) => m.onboarding.howItWorks.title,
  selectiveDisclosure: (m) => m.onboarding.selectiveDisclosure.title,
  security: (m) => m.onboarding.security.title,
  privacy: (m) => m.onboarding.privacy.title,
};

afterEach(() => jest.restoreAllMocks());

describe('the gate (rule)', () => {
  const onboarded = {
    onboardingCompleted: true,
    privacyAcknowledgement: ACKNOWLEDGED,
    securitySetupComplete: false,
  };

  it('onboarding → setup → app, in that order only', () => {
    expect(requiredArea(INITIAL_SETUP_STATE)).toBe('onboarding');
    expect(requiredArea(onboarded)).toBe('setup');
    expect(requiredArea({ ...onboarded, securitySetupComplete: true })).toBe('app');
    // security without onboarding still means onboarding: setup can't be used to skip it
    expect(requiredArea({ ...INITIAL_SETUP_STATE, securitySetupComplete: true })).toBe(
      'onboarding',
    );
  });

  it('needs the completed flag AND an acknowledgement of the current privacy text', () => {
    expect(isOnboardingComplete(onboarded)).toBe(true);
    expect(isOnboardingComplete({ ...onboarded, privacyAcknowledgement: null })).toBe(false);
    expect(
      isOnboardingComplete({
        ...onboarded,
        privacyAcknowledgement: { ...ACKNOWLEDGED, version: 'privacy-v0' },
      }),
    ).toBe(false);
    expect(isOnboardingComplete({ ...onboarded, onboardingCompleted: false })).toBe(false);
    expect(PRIVACY_POLICY_VERSION).toBe('privacy-v1');
  });

  it('gateRedirect: null where the holder belongs, else the area entry', () => {
    expect(gateRedirect(INITIAL_SETUP_STATE, 'onboarding')).toBeNull();
    expect(gateRedirect(INITIAL_SETUP_STATE, 'app')).toBe(ROUTES.onboardingLanguage);
    expect(gateRedirect(INITIAL_SETUP_STATE, 'setup')).toBe(ROUTES.onboardingLanguage);
    expect(gateRedirect(onboarded, 'app')).toBe(ROUTES.setupSecurity);
    expect(gateRedirect(onboarded, 'onboarding')).toBe(ROUTES.setupSecurity);
    expect(gateRedirect({ ...onboarded, securitySetupComplete: true }, 'setup')).toBe(
      ROUTES.credentials,
    );
  });

  it('steps: order, numbers, next / previous, Skip only on the explanation steps', () => {
    expect(ONBOARDING_STEPS.map((s) => s.route)).toEqual([
      ROUTES.onboardingLanguage,
      ROUTES.onboardingWelcome,
      ROUTES.onboardingHowItWorks,
      ROUTES.onboardingSelectiveDisclosure,
      ROUTES.onboardingSecurity,
      ROUTES.onboardingPrivacy,
    ]);
    expect(STEP_COUNT).toBe(6);
    expect(stepNumber('language')).toBe(1);
    expect(stepNumber('privacy')).toBe(6);
    expect(previousStep('language')).toBeNull();
    expect(nextStep('privacy')).toBeNull();
    expect(nextStep('welcome')?.id).toBe('howItWorks');
    expect(SKIP_TARGET.id).toBe('privacy');
    expect(ONBOARDING_STEPS.filter((s) => canSkip(s.id)).map((s) => s.id)).toEqual([
      'welcome',
      'howItWorks',
      'selectiveDisclosure',
      'security',
    ]);
  });
});

describe('setup state outside the app', () => {
  it('useSetup() needs a SetupProvider', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined); // expected
    await expect(renderHook(() => useSetup())).rejects.toThrow(/SetupProvider/);
    error.mockRestore();
  });
});

describe('the gate (app start, typed URLs, deep links)', () => {
  it('first launch opens onboarding at the language step', async () => {
    await freshInstall();
    await openApp(ROUTES.home);
    expect(await screen.findByTestId('onboarding-language')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.onboardingLanguage);
    expect(screen.queryByTestId('tab-credentials')).toBeNull();
  });

  it('completed onboarding + the security placeholder flag opens the tabs', async () => {
    await openApp(ROUTES.home); // test/setup.ts seeds a completed setup
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.credentials);
  });

  it('onboarded without security setup opens /setup/security', async () => {
    await seedOnboardedWithoutSecurity();
    await openApp(ROUTES.home);
    expect(await screen.findByTestId('setup-security-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.setupSecurity);
  });

  it.each([ROUTES.credentials, ROUTES.settings, ROUTES.diagnostics, ROUTES.credential('x')])(
    'a typed tab URL %s before onboarding goes to onboarding',
    async (url) => {
      await freshInstall();
      await openApp(url);
      expect(await screen.findByTestId('onboarding-language')).toBeOnTheScreen();
      expect(screen).toHavePathname(ROUTES.onboardingLanguage);
    },
  );

  it.each([ROUTES.scan, ROUTES.history, ROUTES.credential('sample-kyc-active')])(
    'a typed tab URL %s after onboarding but before security setup goes to setup',
    async (url) => {
      await seedOnboardedWithoutSecurity();
      await openApp(url);
      expect(await screen.findByTestId('setup-security-screen')).toBeOnTheScreen();
      expect(screen).toHavePathname(ROUTES.setupSecurity);
    },
  );

  it('/setup/security cannot be opened before onboarding (no skipping onboarding)', async () => {
    await freshInstall();
    await openApp(ROUTES.setupSecurity);
    expect(await screen.findByTestId('onboarding-language')).toBeOnTheScreen();
  });

  it.each([ROUTES.onboardingWelcome, ROUTES.onboardingPrivacy, ROUTES.setupSecurity])(
    'a finished holder opening %s lands in the wallet',
    async (url) => {
      await openApp(url);
      expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
      expect(screen).toHavePathname(ROUTES.credentials);
    },
  );

  it('an acknowledgement of an older privacy text sends the holder through onboarding again', async () => {
    await AsyncStorage.setItem(
      PREFERENCE_KEYS.privacyAcknowledgedAt,
      JSON.stringify({ ...ACKNOWLEDGED, version: 'privacy-v0' }),
    );
    await openApp(ROUTES.credentials);
    expect(await screen.findByTestId('onboarding-language')).toBeOnTheScreen();
  });
});

describe('every step renders in English and Sinhala', () => {
  it.each(
    ONBOARDING_STEPS.flatMap((step) =>
      (['en', 'si'] as const).map((language) => [step.id, language, step.route] as const),
    ),
  )('%s in %s', async (id, language, route) => {
    await freshInstall();
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, language);
    await openApp(route);
    expect(await screen.findByTestId(`onboarding-${id}`)).toBeOnTheScreen();
    const messages = language === 'si' ? si : en;
    expect(screen.getByRole('header', { name: TITLES[id](messages) })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: id === 'privacy' ? messages.onboarding.privacy.cta : messages.onboarding.next,
      }),
    ).toBeOnTheScreen();
    expect(i18n.language).toBe(language);
  });

  it('Privacy details renders in Sinhala with the text version', async () => {
    await freshInstall();
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, 'si');
    await openApp(ROUTES.onboardingPrivacyDetails);
    expect(await screen.findByTestId('privacy-details-screen')).toBeOnTheScreen();
    expect(screen.getByText(si.onboarding.privacyDetails.univault)).toBeOnTheScreen();
    expect(screen.getByTestId('privacy-version')).toHaveTextContent(/privacy-v1/);
  });

  it('the three-step illustration labels issuer, holder and verifier', async () => {
    await freshInstall();
    await openApp(ROUTES.onboardingHowItWorks);
    await screen.findByTestId('onboarding-howItWorks');
    for (const label of [
      en.onboarding.howItWorks.issuer,
      en.onboarding.howItWorks.holder,
      en.onboarding.howItWorks.verifier,
    ]) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    // the drawing itself is decorative (hidden from screen readers)
    expect(screen.queryByTestId('illustration-how-it-works')).toBeNull();
    expect(
      screen.getByTestId('illustration-how-it-works', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});

describe('Language step', () => {
  it('applies the choice at once and saves it', async () => {
    await freshInstall();
    const user = userEvent.setup();
    await openApp(ROUTES.home);
    await screen.findByTestId('onboarding-language');
    expect(screen.getByRole('radio', { name: en.language.en })).toBeChecked();

    await user.press(screen.getByTestId('onboarding-language-si'));

    expect(
      await screen.findByRole('header', { name: si.onboarding.language.title }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: si.language.si })).toBeChecked();
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.language)).toBe('si');
    await user.press(screen.getByTestId('onboarding-language-si')); // same again: nothing
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('says so if the language could not be saved', async () => {
    await freshInstall();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingLanguage);
    await user.press(await screen.findByTestId('onboarding-language-si'));
    expect(await screen.findByText(si.settings.languageNotSaved)).toBeOnTheScreen();
  });
});

describe('Next, Back, swipe and Skip', () => {
  beforeEach(async () => {
    await freshInstall();
  });

  it('Next walks through every step to Privacy; Back returns one step', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.home);
    await screen.findByTestId('onboarding-language');
    expect(screen.queryByTestId('onboarding-back')).toBeNull(); // first step: no Back
    for (const step of ONBOARDING_STEPS.slice(1)) {
      const nexts = screen.getAllByTestId('onboarding-next');
      await user.press(nexts.at(-1)!);
      expect(await screen.findByTestId(`onboarding-${step.id}`)).toBeOnTheScreen();
      expect(screen).toHavePathname(step.route);
    }
    await user.press(screen.getAllByTestId('onboarding-back').at(-1)!);
    expect(screen).toHavePathname(ROUTES.onboardingSecurity);
    await user.press(screen.getAllByTestId('onboarding-back').at(-1)!);
    expect(screen).toHavePathname(ROUTES.onboardingSelectiveDisclosure);
  });

  it('swipe left = Next, swipe right = Back; short or vertical moves do nothing', async () => {
    await openApp(ROUTES.onboardingWelcome);
    await screen.findByTestId('onboarding-welcome');
    await swipe('welcome', -30); // too short
    await swipe('welcome', -80, 120); // mostly vertical (scrolling)
    expect(screen).toHavePathname(ROUTES.onboardingWelcome);
    await swipe('welcome', -120);
    expect(await screen.findByTestId('onboarding-howItWorks')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.onboardingHowItWorks);
    await swipe('howItWorks', 120);
    expect(screen).toHavePathname(ROUTES.onboardingWelcome);
  });

  it('swipes stop at both ends: no Back from the first step, never past Privacy', async () => {
    await openApp(ROUTES.onboardingLanguage);
    await screen.findByTestId('onboarding-language');
    await swipe('language', 150);
    expect(screen).toHavePathname(ROUTES.onboardingLanguage);
    await act(async () => undefined);
  });

  it('a swipe left on Privacy does not complete onboarding', async () => {
    await openApp(ROUTES.onboardingPrivacy);
    await screen.findByTestId('onboarding-privacy');
    await fireEvent(screen.getByTestId('onboarding-privacy'), 'touchEnd', {
      nativeEvent: { pageX: 0, pageY: 0 },
    }); // an end without a start is ignored
    await swipe('privacy', -200);
    expect(screen).toHavePathname(ROUTES.onboardingPrivacy);
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.onboardingCompleted)).toBeNull();
  });

  it.each(ONBOARDING_STEPS.filter((s) => s.explanation).map((s) => [s.id, s.route] as const))(
    'Skip on %s goes to Privacy (never past it)',
    async (id, route) => {
      const user = userEvent.setup();
      await openApp(route);
      await screen.findByTestId(`onboarding-${id}`);
      await user.press(screen.getByRole('button', { name: en.onboarding.skip }));
      expect(await screen.findByTestId('onboarding-privacy')).toBeOnTheScreen();
      expect(screen).toHavePathname(ROUTES.onboardingPrivacy);
      expect(await AsyncStorage.getItem(PREFERENCE_KEYS.onboardingCompleted)).toBeNull();
    },
  );

  it('Language and Privacy have no Skip', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingLanguage);
    await screen.findByTestId('onboarding-language');
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    await user.press(screen.getByTestId('onboarding-next'));
    await user.press(await screen.findByTestId('onboarding-skip'));
    const privacy = await screen.findByTestId('onboarding-privacy');
    expect(within(privacy).queryByTestId('onboarding-skip')).toBeNull();
  });

  it('Back after a Skip goes to the step before Privacy, not where Skip was pressed', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingWelcome);
    await user.press(await screen.findByTestId('onboarding-skip'));
    await screen.findByTestId('onboarding-privacy');
    await user.press(screen.getAllByTestId('onboarding-back').at(-1)!);
    expect(await screen.findByTestId('onboarding-security')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.onboardingSecurity);
  });
});

describe('Privacy: "I understand" and the acknowledgement', () => {
  beforeEach(async () => {
    await freshInstall();
  });

  it('"Set up security" needs "I understand"; then it stores the date and version and opens setup', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingPrivacy);
    await screen.findByTestId('onboarding-privacy');
    const cta = screen.getByRole('button', { name: en.onboarding.privacy.cta });
    expect(cta).toBeDisabled();
    expect(cta.props.accessibilityHint).toBe(en.onboarding.privacy.ctaHint);
    await user.press(cta);
    expect(screen).toHavePathname(ROUTES.onboardingPrivacy);

    const box = screen.getByRole('checkbox', { name: en.onboarding.privacy.understand });
    expect(box).not.toBeChecked();
    await user.press(box);
    expect(box).toBeChecked();
    await user.press(box); // and off again
    expect(box).not.toBeChecked();
    expect(cta).toBeDisabled();
    await user.press(box);
    expect(cta).toBeEnabled();

    const before = Date.now();
    await user.press(cta);
    expect(await screen.findByTestId('setup-security-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.setupSecurity);

    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.onboardingCompleted)).toBe(FLAG_TRUE);
    const stored = JSON.parse(
      (await AsyncStorage.getItem(PREFERENCE_KEYS.privacyAcknowledgedAt)) ?? 'null',
    ) as { at: string; version: string };
    expect(stored.version).toBe('privacy-v1');
    expect(stored.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(stored.at)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(stored.at)).toBeLessThanOrEqual(Date.now());
    // security is still not set up: no PIN yet, the tabs stay closed
    expect(secureStore.has(PIN_VERIFIER_KEY)).toBe(false);
  });

  it('a failed save still moves on this session and says so', async () => {
    multiSet.mockRejectedValueOnce(new Error('disk'));
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingPrivacy);
    await user.press(await screen.findByTestId('onboarding-understand'));
    await user.press(screen.getByTestId('onboarding-next'));
    expect(await screen.findByText(en.onboarding.privacy.notSaved)).toBeOnTheScreen();
    expect(await screen.findByTestId('setup-security-screen')).toBeOnTheScreen();
  });

  it('"Privacy details" opens the static details and Back returns to Privacy', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingPrivacy);
    await user.press(await screen.findByTestId('onboarding-privacy-details'));
    expect(await screen.findByTestId('privacy-details-screen')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: en.onboarding.privacyDetails.title }),
    ).toBeOnTheScreen();
    expect(screen.getByText(en.onboarding.privacyDetails.univault)).toBeOnTheScreen();
    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen).toHavePathname(ROUTES.onboardingPrivacy);
  });
});

describe('Android back button', () => {
  beforeEach(async () => {
    await freshInstall();
  });

  it('on the first step leaves the app', async () => {
    const { pressBack, exitApp } = installBackHandler();
    await openApp(ROUTES.home);
    await screen.findByTestId('onboarding-language');
    expect(await pressBack()).toBe(true);
    expect(exitApp).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname(ROUTES.onboardingLanguage);
  });

  it('on later steps goes to the previous step (also after a Skip), never out', async () => {
    const { pressBack, exitApp } = installBackHandler();
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingLanguage);
    await user.press(await screen.findByTestId('onboarding-next'));
    await screen.findByTestId('onboarding-welcome');
    await user.press(screen.getByTestId('onboarding-skip'));
    await screen.findByTestId('onboarding-privacy');

    expect(await pressBack()).toBe(true);
    expect(screen).toHavePathname(ROUTES.onboardingSecurity);
    expect(await pressBack()).toBe(true);
    expect(screen).toHavePathname(ROUTES.onboardingSelectiveDisclosure);
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('on Privacy details returns to Privacy', async () => {
    const { pressBack } = installBackHandler();
    const user = userEvent.setup();
    await openApp(ROUTES.onboardingPrivacy);
    await user.press(await screen.findByTestId('onboarding-privacy-details'));
    await screen.findByTestId('privacy-details-screen');
    expect(await pressBack()).toBe(true);
    expect(screen).toHavePathname(ROUTES.onboardingPrivacy);
  });
});

describe('screen readers: "Step X of Y"', () => {
  it.each(ONBOARDING_STEPS.map((s) => [s.id, s.route] as const))(
    '%s announces its step',
    async (id, route) => {
      await freshInstall();
      await openApp(route);
      const step = await screen.findByTestId(`onboarding-${id}`);
      const progress = within(step).getByRole('progressbar');
      const label = `Step ${stepNumber(id)} of 6`;
      expect(progress.props.accessibilityLabel).toBe(label);
      expect(progress.props.accessibilityValue).toEqual({
        min: 1,
        max: 6,
        now: stepNumber(id),
        text: label,
      });
      expect(progress.props.accessibilityLiveRegion).toBe('polite');
      // the dots: done ones in accent, the rest border-strong (and the current one is longer)
      expect(
        within(step).getAllByTestId('onboarding-dot-done', { includeHiddenElements: true }),
      ).toHaveLength(stepNumber(id));
    },
  );

  it('in Sinhala too', async () => {
    await freshInstall();
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, 'si');
    await openApp(ROUTES.onboardingHowItWorks);
    await screen.findByTestId('onboarding-howItWorks');
    expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('පියවර 6 න් 3 වැන්න');
  });
});

describe('reduce motion', () => {
  it('turns stack transitions off, and follows the setting live', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    const { result } = await renderHook(() => useStackScreenOptions());
    await waitFor(() => expect(result.current.animation).toBe('none'));
    const listener = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.find(
      ([event]) => event === 'reduceMotionChanged',
    )?.[1] as (on: boolean) => void;
    await act(async () => listener(false));
    expect(result.current.animation).toBe('default');
  });

  it('keeps the animations when the phone does not answer', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockRejectedValueOnce(new Error('n/a'));
    const { result } = await renderHook(() => useStackScreenOptions());
    await act(async () => undefined);
    expect(result.current.animation).toBe('default');
  });

  it('dialogs appear without fading', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    await renderWithProviders(
      <ConfirmDialog
        visible
        title="T"
        message="M"
        confirmLabel="OK"
        onConfirm={() => undefined}
        onCancel={() => undefined}
        testID="dialog"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('dialog-modal').props.animationType).toBe('none'),
    );
  });

  it('every onboarding and setup stack uses the shared (reduce-motion aware) options', () => {
    for (const file of ['onboarding/_layout.tsx', 'setup/_layout.tsx', '_layout.tsx']) {
      expect(readFileSync(join(APP_DIR, file), 'utf8')).toMatch(/useStackScreenOptions\(\)/);
    }
  });
});

describe('design: dark theme, large text, one primary action', () => {
  it.each(ONBOARDING_STEPS.map((s) => [s.id, s.route] as const))(
    '%s in the dark theme',
    async (id, route) => {
      await freshInstall();
      await saveAppearancePreference('dark');
      await openApp(route);
      const root = await screen.findByTestId(`onboarding-${id}`);
      expect(flat(root.props.style).backgroundColor).toBe(darkColors.bg);
      expect(screen.getByTestId('onboarding-illustration')).toHaveStyle({
        backgroundColor: darkColors.brand,
      });
      expect(screen.getByTestId('onboarding-next')).toHaveStyle({
        backgroundColor: darkColors.accent,
      });
    },
  );

  it.each(ONBOARDING_STEPS.map((s) => [s.id, s.route] as const))(
    '%s: text can grow with the OS size without being cut off; one primary button',
    async (id, route) => {
      await freshInstall();
      await openApp(route);
      const step = await screen.findByTestId(`onboarding-${id}`);
      // every readable text (icons are glyphs, hidden from screen readers, and never scale)
      for (const text of within(step).getAllByText(/./)) {
        expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.adjustsFontSizeToFit).toBeUndefined();
        expect(text.props.allowFontScaling).not.toBe(false);
      }
      // full-width buttons stacked in the bottom actions (primary first), never squeezed side by side
      const next = within(step).getByTestId('onboarding-next');
      expect(next.parent?.props.testID).toBe('onboarding-actions-buttons');
      expect(flat(next.parent?.props.style).flexDirection).toBeUndefined();
      const back = within(step).queryByTestId('onboarding-back');
      if (back)
        expect(next.parent?.children.indexOf(next)).toBeLessThan(
          next.parent?.children.indexOf(back) ?? -1,
        );
      const primaries = within(step)
        .getAllByRole('button')
        .filter((el) => flat(el.props.style)?.backgroundColor === lightColors.accent);
      expect(primaries).toHaveLength(1);
    },
  );
});

describe('Diagnostics → Reset onboarding (development builds only)', () => {
  it('asks first, then clears the setup flags (keeping language and appearance) and opens onboarding', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, 'en');
    await saveAppearancePreference('dark');
    const user = userEvent.setup();
    await openApp(ROUTES.diagnostics);
    await user.press(await screen.findByTestId('reset-onboarding-button'));
    expect(screen.getByText(en.diagnostics.resetConfirmMessage)).toBeOnTheScreen();

    await user.press(screen.getByTestId('reset-onboarding-dialog-confirm'));

    expect(await screen.findByTestId('onboarding-language')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.onboardingLanguage);
    expect(await screen.findByText(en.diagnostics.resetDone)).toBeOnTheScreen();
    for (const key of [
      PREFERENCE_KEYS.onboardingCompleted,
      PREFERENCE_KEYS.privacyAcknowledgedAt,
    ]) {
      expect(await AsyncStorage.getItem(key)).toBeNull();
    }
    // the PIN verifier and the attempt record are gone from the secure store
    expect(secureStore.has(PIN_VERIFIER_KEY)).toBe(false);
    expect(secureStore.has(PIN_ATTEMPTS_KEY)).toBe(false);
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.language)).toBe('en');
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.appearance)).toBe('dark');
    expect(flat(screen.getByTestId('onboarding-language').props.style).backgroundColor).toBe(
      darkColors.bg,
    );
  });

  it('Cancel keeps everything', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.diagnostics);
    await user.press(await screen.findByTestId('reset-onboarding-button'));
    await user.press(screen.getByTestId('reset-onboarding-dialog-cancel'));
    expect(multiRemove).not.toHaveBeenCalled();
    expect(screen).toHavePathname(ROUTES.diagnostics);
  });

  it('a failed reset says so and stays', async () => {
    multiRemove.mockRejectedValueOnce(new Error('disk'));
    const user = userEvent.setup();
    await openApp(ROUTES.diagnostics);
    await user.press(await screen.findByTestId('reset-onboarding-button'));
    await user.press(screen.getByTestId('reset-onboarding-dialog-confirm'));
    expect(await screen.findByText(en.diagnostics.resetFailed)).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.diagnostics);
  });

  it('is hidden in release builds', async () => {
    jest.spyOn(appInfo, 'onboardingResetEnabled').mockReturnValue(false);
    await openApp(ROUTES.diagnostics);
    await screen.findByTestId('diagnostics-screen');
    expect(screen.queryByTestId('reset-onboarding')).toBeNull();
  });

  it('Diagnostics (and so the reset) is behind an inline __DEV__ gate, dropped from release bundles', () => {
    const source = readFileSync(join(APP_DIR, '(tabs)', 'settings', 'diagnostics.tsx'), 'utf8');
    expect(source).toContain('if (!__DEV__ || !diagnosticsEnabled())');
    expect(source.indexOf('if (!__DEV__ || !diagnosticsEnabled())')).toBeLessThan(
      source.indexOf('<ResetOnboardingCard />'),
    );
  });
});
