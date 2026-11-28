import { useTranslation } from 'react-i18next';
import { useEffectiveColorScheme } from './appearance';
import { fontFor, getTheme, typeStyle, type Theme, type TypeStep, type Weight } from './index';

export interface ThemeWithScript extends Theme {
  /** 'sinhala' while the UI language is Sinhala (Noto Sans Sinhala is used). */
  script: 'latin' | 'sinhala';
  /** The registered font family for a weight in the current script. */
  fontFamily: (weight: Weight) => string;
  /** Size, line height and family of a type step in the current script. */
  type: (step: TypeStep) => { fontSize: number; lineHeight: number; fontFamily: string };
}

/**
 * The theme for the effective colour scheme (Settings → Appearance, or the phone's setting:
 * src/theme/appearance.tsx) and the current UI language.
 */
export function useTheme(): ThemeWithScript {
  const scheme = useEffectiveColorScheme();
  const { i18n } = useTranslation();
  const script = i18n.language === 'si' ? 'sinhala' : 'latin';
  return {
    ...getTheme(scheme),
    script,
    fontFamily: (weight) => fontFor(weight, script),
    type: (step) => typeStyle(step, script),
  };
}
