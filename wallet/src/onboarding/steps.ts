/**
 * The onboarding steps, in order (app/onboarding/). One list for the routes, Next / Back, swipes,
 * Skip, the progress dots and the screen-reader "Step X of Y".
 *
 *   language → welcome → how-it-works → selective-disclosure → security → privacy → (gate) setup
 *
 * The four explanation steps can be skipped; Skip always lands on Privacy, never past it (Privacy
 * has the "I understand" box that completes onboarding).
 */
import { ROUTES } from '../navigation/routes';

export const ONBOARDING_STEPS = [
  { id: 'language', route: ROUTES.onboardingLanguage, explanation: false },
  { id: 'welcome', route: ROUTES.onboardingWelcome, explanation: true },
  { id: 'howItWorks', route: ROUTES.onboardingHowItWorks, explanation: true },
  { id: 'selectiveDisclosure', route: ROUTES.onboardingSelectiveDisclosure, explanation: true },
  { id: 'security', route: ROUTES.onboardingSecurity, explanation: true },
  { id: 'privacy', route: ROUTES.onboardingPrivacy, explanation: false },
] as const satisfies readonly { id: string; route: string; explanation: boolean }[];

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStepId = OnboardingStep['id'];

export const STEP_COUNT = ONBOARDING_STEPS.length;

/** Where Skip goes (the last step: it is never skipped). */
export const SKIP_TARGET: OnboardingStep = ONBOARDING_STEPS[STEP_COUNT - 1]!;

const indexOf = (id: OnboardingStepId): number => ONBOARDING_STEPS.findIndex((s) => s.id === id);

/** 1-based position, for "Step X of Y". */
export const stepNumber = (id: OnboardingStepId): number => indexOf(id) + 1;

export const nextStep = (id: OnboardingStepId): OnboardingStep | null =>
  ONBOARDING_STEPS[indexOf(id) + 1] ?? null;

export const previousStep = (id: OnboardingStepId): OnboardingStep | null =>
  ONBOARDING_STEPS[indexOf(id) - 1] ?? null;

/** Skip is offered on the explanation steps only. */
export const canSkip = (id: OnboardingStepId): boolean =>
  ONBOARDING_STEPS[indexOf(id)]?.explanation === true;
