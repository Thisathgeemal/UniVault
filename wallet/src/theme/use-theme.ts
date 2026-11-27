import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getTheme, SINHALA_FONTS, type Theme } from './index';

export interface ThemeWithScript extends Theme {
  /** 'sinhala' while the UI language is Sinhala (fonts and line height follow). */
  script: 'latin' | 'sinhala';
  /** The font family for a weight in the current script (undefined = system font). */
  fontFamily: (weight: 'regular' | 'bold') => string | undefined;
}

/** The theme for the OS colour scheme and the current UI language. */
export function useTheme(): ThemeWithScript {
  const scheme = useColorScheme();
  const { i18n } = useTranslation();
  const script = i18n.language === 'si' ? 'sinhala' : 'latin';
  return {
    ...getTheme(scheme),
    script,
    fontFamily: (weight) => (script === 'sinhala' ? SINHALA_FONTS[weight] : undefined),
  };
}
