import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True while the phone's "reduce motion" / "remove animations" setting is on (read at mount,
 * then followed live). Screens use it to switch transitions off (useStackScreenOptions,
 * ConfirmDialog). Starts false, so a phone that never answers keeps the normal animations.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value === true);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduce(value === true);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
