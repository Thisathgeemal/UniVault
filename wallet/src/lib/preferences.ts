/**
 * UI preferences on the phone (AsyncStorage).
 *
 * STORAGE RULE: AsyncStorage is unencrypted, readable by anyone with a device backup or a
 * rooted phone. It holds UI PREFERENCES ONLY: today just the language. Never a key, credential,
 * SD-JWT, claim, token, PIN or anything personal: those go in secure storage (expo-secure-store:
 * Keychain / Android Keystore) from the holder-key and vault tasks. Every key is listed in
 * PREFERENCE_KEYS; test/preferences.test.ts checks nothing else is ever written.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isLanguage, type Language } from '../i18n/languages';

/** The ONLY keys the wallet writes to AsyncStorage (same name as the portals' localStorage key). */
export const PREFERENCE_KEYS = {
  language: 'univault.language',
} as const;

/** The saved language, or null when none is saved, the value is unknown or storage fails. */
export async function loadLanguagePreference(): Promise<Language | null> {
  try {
    const value = await AsyncStorage.getItem(PREFERENCE_KEYS.language);
    return isLanguage(value) ? value : null;
  } catch {
    return null; // storage unavailable: start in the device language
  }
}

/** Saves the language; returns false if storage failed (the choice still applies this session). */
export async function saveLanguagePreference(language: Language): Promise<boolean> {
  try {
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, language);
    return true;
  } catch {
    return false;
  }
}
