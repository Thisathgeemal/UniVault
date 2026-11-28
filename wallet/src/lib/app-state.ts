/**
 * Everything the first frame depends on, read in ONE step while the splash screen is up
 * (app/_layout.tsx): the language (applied to i18next), the appearance (theme) and the setup
 * state for the gate. So the first frame is already in the right language and theme, on the
 * right screen. Never rejects: every read falls back (device language, "Use device setting",
 * "not done").
 */
import { restoreLanguage, type Language } from '../i18n';
import { restoreSetupState } from '../onboarding/SetupProvider';
import type { SetupState } from '../onboarding/gate';
import { loadAppearancePreference, type AppearancePreference } from './preferences';

export interface RestoredAppState {
  language: Language;
  appearance: AppearancePreference;
  setup: SetupState;
}

export async function restoreAppState(): Promise<RestoredAppState> {
  // the language read starts first (the restart test holds it to look at the frames before it)
  const [language, appearance, setup] = await Promise.all([
    restoreLanguage(),
    loadAppearancePreference(),
    restoreSetupState(),
  ]);
  return { language, appearance, setup };
}
