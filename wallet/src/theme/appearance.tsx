/**
 * Appearance (Settings → Appearance): "Use device setting" (default), "Light" or "Dark".
 *
 * The EFFECTIVE colour scheme is the choice, or the phone's scheme while "Use device setting" is
 * selected; only then do live system changes apply (useColorScheme() is read on every render).
 * Every themed thing reads it through useTheme() (screens, Header, tab bar, dialogs, toasts),
 * the navigation container gets a matching theme (app/_layout.tsx) and the status bar follows it
 * (src/navigation/status-bar.tsx), so a change applies app-wide at once.
 *
 * Native UI (system alerts, the keyboard, pickers) follows through Appearance.setColorScheme():
 * the override is set in the same event as the choice (never in an effect, so no render reads a
 * stale override) and "unspecified" hands the decision back to the phone.
 *
 * The choice is saved as a non-secret preference (src/lib/preferences.ts) and restored before
 * the first frame together with the language (app/_layout.tsx), so the wrong theme never flashes.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import {
  DEFAULT_APPEARANCE,
  saveAppearancePreference,
  type AppearancePreference,
} from '../lib/preferences';

export type ColorScheme = 'light' | 'dark';

/** The scheme to draw: the choice, or the phone's scheme for "system" (light if unknown). */
export function effectiveScheme(
  preference: AppearancePreference,
  system: string | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Tells native UI which scheme to use ("unspecified": follow the phone). Never throws. */
export function applyNativeColorScheme(preference: AppearancePreference): void {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  } catch {
    // no native Appearance module (tests, unusual platforms): the React tree is still themed
  }
}

export interface AppearanceApi {
  preference: AppearancePreference;
  /** Applies at once and saves; resolves false if it could not be saved. */
  setPreference: (preference: AppearancePreference) => Promise<boolean>;
}

const AppearanceContext = createContext<AppearanceApi>({
  // Without a provider (a component rendered on its own in a test) the phone decides
  preference: DEFAULT_APPEARANCE,
  setPreference: () => Promise.reject(new Error('setPreference needs an <AppearanceProvider>')),
});

export function AppearanceProvider({
  initial = DEFAULT_APPEARANCE,
  children,
}: {
  /** The restored preference (app/_layout.tsx reads it before the first frame). */
  initial?: AppearancePreference;
  children: ReactNode;
}) {
  const [preference, setState] = useState<AppearancePreference>(() => {
    applyNativeColorScheme(initial);
    return initial;
  });
  const setPreference = useCallback(async (next: AppearancePreference) => {
    applyNativeColorScheme(next);
    setState(next);
    return saveAppearancePreference(next);
  }, []);
  const api = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <AppearanceContext.Provider value={api}>{children}</AppearanceContext.Provider>;
}

/** The Appearance choice and its setter (Settings → Appearance). */
export function useAppearance(): AppearanceApi {
  return useContext(AppearanceContext);
}

/** The scheme every themed component draws with (see effectiveScheme). */
export function useEffectiveColorScheme(): ColorScheme {
  const { preference } = useContext(AppearanceContext);
  const system = useColorScheme(); // always read (hook order), used only for "system"
  return effectiveScheme(preference, system);
}
