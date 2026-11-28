/**
 * PinPad: six digit dots and an on-screen number pad (no system keyboard).
 *
 *   1 2 3
 *   4 5 6        every key ≥ 56 pt, role "button", spoken label (the digit, or "Delete")
 *   7 8 9
 *     0 ⌫
 *
 * The dots are one element announced as "3 of 6 digits entered" (a polite live region): never the
 * digits. Controlled: the parent keeps `value` and MUST clear it inside `onComplete` (the PIN is
 * kept no longer than needed: docs/security/wallet-pin.md §6). A change of `errorCount` shakes
 * the dots briefly, or does nothing visible while the phone's "reduce motion" setting is on (the
 * parent shows the error text either way). Centred, at most 360 pt wide.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { PIN_LENGTH } from '../security/pin-rules';
import { space, TRANSPARENT } from '../theme';
import { useReduceMotion } from '../theme/reduce-motion';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** Minimum key size (points): larger than the 44 pt touch target, as on phone dial pads. */
export const PIN_KEY_MIN_SIZE = space(14); // 56
const DOT_SIZE = space(4);
const SHAKE_DISTANCE = space(2);

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'delete'],
] as const;

export interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  /** Called once when the last digit is entered; clear `value` here. */
  onComplete: (pin: string) => void;
  /** Increase to signal an error (shake unless reduce motion). */
  errorCount?: number;
  /** While the PIN is being checked or saved. */
  disabled?: boolean;
  testID?: string;
}

export function PinPad({
  value,
  onChange,
  onComplete,
  errorCount = 0,
  disabled = false,
  testID = 'pin-pad',
}: PinPadProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  // created once (state, not a ref: nothing is read from a ref while rendering)
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (errorCount === 0 || reduceMotion) return;
    shake.setValue(0);
    const step = (to: number) =>
      Animated.timing(shake, { toValue: to, duration: 50, useNativeDriver: true });
    Animated.sequence([
      step(SHAKE_DISTANCE),
      step(-SHAKE_DISTANCE),
      step(SHAKE_DISTANCE),
      step(0),
    ]).start();
  }, [errorCount, reduceMotion, shake]);

  const press = (key: string) => {
    if (key === 'delete') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= PIN_LENGTH) return;
    const next = value + key;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  };

  const dotsLabel = t('pin.dots', { count: value.length, total: PIN_LENGTH });

  return (
    <View testID={testID} style={[styles.root, { gap: theme.space(6) }]}>
      <Animated.View
        testID={`${testID}-dots`}
        accessible
        accessibilityLabel={dotsLabel}
        accessibilityLiveRegion="polite"
        style={[styles.dots, { gap: theme.space(4), transform: [{ translateX: shake }] }]}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            testID={i < value.length ? `${testID}-dot-filled` : `${testID}-dot`}
            style={[
              styles.dot,
              {
                borderRadius: theme.radius.pill,
                // filled vs outlined: shape as well as colour
                borderColor: i < value.length ? theme.colors.text : theme.colors.borderStrong,
                backgroundColor: i < value.length ? theme.colors.text : TRANSPARENT,
              },
            ]}
          />
        ))}
      </Animated.View>

      <View accessibilityLabel={t('pin.keypad')} style={[styles.keys, { gap: theme.space(3) }]}>
        {ROWS.map((row, r) => (
          <View key={r} style={[styles.row, { gap: theme.space(3) }]}>
            {row.map((key, k) => {
              if (key === null) return <View key={k} style={styles.key} />;
              const isDelete = key === 'delete';
              const inactive = disabled || (isDelete && value.length === 0);
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={isDelete ? t('pin.delete') : key}
                  accessibilityState={{ disabled: inactive }}
                  disabled={inactive}
                  onPress={() => press(key)}
                  testID={`${testID}-key-${key}`}
                  style={({ pressed }) => [
                    styles.key,
                    {
                      borderRadius: theme.radius.md,
                      backgroundColor: isDelete ? TRANSPARENT : theme.colors.surface,
                      borderColor: isDelete ? TRANSPARENT : theme.colors.border,
                      opacity: inactive ? 0.55 : pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  {isDelete ? (
                    <Icon name="backspace-outline" size={28} color={theme.colors.text} />
                  ) : (
                    <AppText variant="h1">{key}</AppText>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: space(90) },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dot: { width: DOT_SIZE, minHeight: DOT_SIZE, borderWidth: 2 },
  keys: { width: '100%' },
  row: { flexDirection: 'row' },
  key: {
    flex: 1,
    minWidth: PIN_KEY_MIN_SIZE,
    minHeight: PIN_KEY_MIN_SIZE,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
