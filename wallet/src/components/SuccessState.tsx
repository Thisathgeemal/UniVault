import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../theme/reduce-motion';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** Where the check mark's scale-in starts (it grows to full size). */
export const SUCCESS_START_SCALE = 0.6;
export const SUCCESS_ANIMATION_MS = 250;
/** The check mark's brand-soft circle and the accent circle-check inside it (not status green). */
const CIRCLE = 96;
const CHECK = 64;

export interface SuccessStateProps {
  /** The heading, e.g. "PIN set" (already translated); announced to screen readers. */
  title: string;
  /** One line under the heading. */
  body: string;
  /** Extra lines under the body (optional). */
  children?: ReactNode;
  testID: string;
  /** testID of the heading (screens keep their own, e.g. "setup-title"). */
  titleTestID?: string;
}

/**
 * The success state (design-system.md, "Success state"): a large circle-check in accent inside a
 * brand-soft circle (a confirmation is not a status: no status colours), the h2 heading in text
 * and one line, centred as one group in the space above
 * the screen's BottomActions (Continue). The heading is announced when it appears. The check mark
 * scales in briefly (SUCCESS_ANIMATION_MS), or is simply there while reduce motion is on.
 */
export function SuccessState({ title, body, children, testID, titleTestID }: SuccessStateProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(reduceMotion ? 1 : SUCCESS_START_SCALE));

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return undefined;
    }
    const animation = Animated.timing(scale, {
      toValue: 1,
      duration: SUCCESS_ANIMATION_MS,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, scale]);

  return (
    <View testID={testID} style={[styles.group, { padding: theme.space(4), gap: theme.space(4) }]}>
      <Animated.View
        testID={`${testID}-check`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.circle, { backgroundColor: theme.colors.brandSoft, transform: [{ scale }] }]}
      >
        <Icon name="checkmark-circle" size={CHECK} color={theme.colors.accent} />
      </Animated.View>
      <View style={[styles.text, { gap: theme.space(2) }]}>
        <AppText
          variant="h2"
          accessibilityRole="header"
          style={styles.centre}
          {...(titleTestID ? { testID: titleTestID } : {})}
        >
          {title}
        </AppText>
        <AppText style={styles.centre}>{body}</AppText>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // the short lead text under a centred hero heading: at most 320 pt (Wallet typography)
  text: { width: '100%', maxWidth: 320 },
  centre: { textAlign: 'center' },
});
