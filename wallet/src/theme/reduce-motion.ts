import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The last answer from the phone, shared by every hook instance: a screen mounted after the app
 * start (an onboarding step, a dialog) starts with the known setting, so it never begins an
 * animation that reduce motion forbids.
 */
let lastKnown = false;

/** Tests only: forget the shared answer (test/setup.ts, before every test). */
export function resetReduceMotionCache(): void {
  lastKnown = false;
}

/**
 * True while the phone's "reduce motion" / "remove animations" setting is on (read at mount,
 * then followed live). Screens use it to switch transitions off (useStackScreenOptions,
 * ConfirmDialog, the onboarding fade-in, the PinPad shake). Starts with the last known answer
 * (false before the first one, so a phone that never answers keeps the normal animations).
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(lastKnown);
  useEffect(() => {
    let active = true;
    const update = (value: boolean) => {
      lastKnown = value === true;
      if (active) setReduce(lastKnown);
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
