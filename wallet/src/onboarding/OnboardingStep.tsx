/**
 * The frame of every onboarding step (app/onboarding/*), one visual language for all six: an
 * optional Skip (explanation steps only, goes to Privacy), ONE illustration at the top in a
 * brand-soft area (radius-lg, the same size on every step), the centred hero heading (h2 20)
 * and centred short supporting text (≤ 320 pt), then left-aligned icon rows
 * or numbered rows for list-like content; the content fades in (not with reduce motion); a
 * BottomActions footer: the progress dots ("Step X of Y" for screen readers), then Next (full
 * width, the primary) above Back.
 *
 * Navigation (order in src/onboarding/steps.ts):
 *   - Next (the ONE primary button) pushes the next step; Privacy passes its own primary
 *     ("Set up security"), which the gate turns into the move to security setup.
 *   - Back (secondary) and Android's back button go to the PREVIOUS STEP (dismissTo: pops to it,
 *     or replaces this screen with it after a Skip or a deep link). On the first step Android's
 *     back button leaves the app (BackHandler.exitApp), the platform norm.
 *   - A horizontal swipe does the same: right = Back, left = Next (never forward from Privacy:
 *     Skip and swipes cannot pass it).
 *   - With "reduce motion" on, steps change without animation (useStackScreenOptions).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  BackHandler,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { BottomActions } from '../components/BottomActions';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { MAX_READABLE_WIDTH, space } from '../theme';
import { useReduceMotion } from '../theme/reduce-motion';
import { useTheme } from '../theme/use-theme';
import {
  canSkip,
  nextStep,
  previousStep,
  SKIP_TARGET,
  STEP_COUNT,
  stepNumber,
  type OnboardingStepId,
} from './steps';

/** A swipe: at least this far sideways (points) and mostly horizontal. */
export const SWIPE_DISTANCE = 60;

/** Centred supporting text stops at this width, so centred lines stay short (≈ 320 pt). */
export const LEAD_MAX_WIDTH = space(80);

/** The fade-in of a step's content (only while reduce motion is off). */
export const FADE_IN_MS = 220;

export interface OnboardingPrimary {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
}

export interface OnboardingStepProps {
  step: OnboardingStepId;
  title: string;
  /** Short supporting text under the heading, centred (≤ LEAD_MAX_WIDTH); one or two sentences. */
  lead: string | readonly string[];
  /** muted: the lead in 14 text-muted (the language step); default: body 16. */
  leadTone?: 'default' | 'muted';
  illustration?: ReactNode;
  children?: ReactNode;
  /** Replaces "Next" (Privacy: "Set up security"). Without it, Next goes to the next step. */
  primary?: OnboardingPrimary;
}

function ProgressDots({ current, label }: { current: number; label: string }) {
  const theme = useTheme();
  return (
    <View
      testID="onboarding-progress"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: STEP_COUNT, now: current, text: label }}
      accessibilityLiveRegion="polite"
      style={[styles.progress, { gap: theme.space(3) }]}
    >
      <View style={[styles.dots, { gap: theme.space(2) }]}>
        {Array.from({ length: STEP_COUNT }, (_, i) => {
          const done = i + 1 <= current;
          return (
            <View
              key={i}
              testID={done ? 'onboarding-dot-done' : 'onboarding-dot'}
              style={{
                width: i + 1 === current ? theme.space(6) : theme.space(2),
                minHeight: theme.space(2),
                borderRadius: theme.radius.pill,
                // shape (the current dot is long) and colour: never colour alone
                backgroundColor: done ? theme.colors.accent : theme.colors.borderStrong,
              }}
            />
          );
        })}
      </View>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

export function OnboardingStep({
  step,
  title,
  lead,
  leadTone = 'default',
  illustration,
  children,
  primary,
}: OnboardingStepProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  // a subtle fade-in of the content; none (fully visible at once) with reduce motion on
  const [opacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return undefined;
    }
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [reduceMotion, opacity]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const next = nextStep(step);
  const previous = previousStep(step);
  const stepLabel = t('onboarding.stepOf', { current: stepNumber(step), total: STEP_COUNT });

  // null where there is no such step (no Back on the first step; Privacy has its own primary)
  const goNext = useMemo(() => (next ? () => router.push(next.route) : null), [router, next]);
  const goBack = useMemo(
    () => (previous ? () => router.dismissTo(previous.route) : null),
    [router, previous],
  );

  // Android back button: previous step, or out of the app from the first one
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (goBack) goBack();
        else BackHandler.exitApp();
        return true;
      });
      return () => subscription.remove();
    }, [goBack]),
  );

  // Horizontal swipe (touch start / end on the whole step; taps move too little to count)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeForward = primary === undefined ? goNext : null;
  // the ONE primary button: the step's own (Privacy) or Next
  const action: OnboardingPrimary | null =
    primary ?? (goNext ? { label: t('onboarding.next'), onPress: goNext } : null);
  const onTouchStart = (event: GestureResponderEvent) => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
  };
  const onTouchEnd = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = event.nativeEvent.pageX - start.x;
    const dy = event.nativeEvent.pageY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 2 * Math.abs(dy)) return;
    if (dx < 0 && swipeForward) swipeForward();
    else if (dx > 0 && goBack) goBack();
  };

  return (
    <View
      testID={`onboarding-${step}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.bg,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: theme.space(4), paddingBottom: theme.space(6), gap: theme.space(6) },
        ]}
      >
        {canSkip(step) ? (
          <View style={styles.skip}>
            <Button
              variant="text"
              label={t('onboarding.skip')}
              accessibilityHint={t('onboarding.skipHint')}
              onPress={() => router.push(SKIP_TARGET.route)}
              testID="onboarding-skip"
            />
          </View>
        ) : null}
        <Animated.View testID="onboarding-content" style={{ opacity, gap: theme.space(6) }}>
          {illustration ? (
            <View
              testID="onboarding-illustration"
              style={{
                backgroundColor: theme.colors.brandSoft,
                borderRadius: theme.radius.lg,
                padding: theme.space(4),
              }}
            >
              {illustration}
            </View>
          ) : null}
          {/* hero: centred heading and centred short supporting text (onboarding only) */}
          <View style={[styles.hero, { gap: theme.space(2) }]}>
            <AppText variant="h2" accessibilityRole="header" style={styles.centre}>
              {title}
            </AppText>
            {(typeof lead === 'string' ? [lead] : lead).map((line) => (
              <AppText
                key={line}
                testID="onboarding-lead"
                tone={leadTone === 'muted' ? 'muted' : 'default'}
                style={[styles.centre, styles.lead]}
              >
                {line}
              </AppText>
            ))}
          </View>
          {children ? <View style={{ gap: theme.space(4) }}>{children}</View> : null}
        </Animated.View>
      </ScrollView>

      <BottomActions
        testID="onboarding-actions"
        above={<ProgressDots current={stepNumber(step)} label={stepLabel} />}
      >
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            disabled={action.disabled ?? false}
            {...(action.accessibilityHint ? { accessibilityHint: action.accessibilityHint } : {})}
            testID="onboarding-next"
          />
        ) : null}
        {goBack ? (
          <Button
            variant="secondary"
            label={t('common.back')}
            onPress={goBack}
            testID="onboarding-back"
          />
        ) : null}
      </BottomActions>
    </View>
  );
}

/**
 * An icon row for list-like content: a decorative icon in a small brand-soft circle
 * (`accent-text-on-soft`) and one sentence in body text, left-aligned.
 */
export function OnboardingPoint({
  icon,
  children,
  testID,
}: {
  icon: IconName;
  children: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View testID={testID} style={[styles.row, { gap: theme.space(3) }]}>
      <View
        testID="onboarding-point-icon"
        style={[
          styles.badge,
          { backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.pill },
        ]}
      >
        <Icon name={icon} size={20} color={theme.colors.accentTextOnSoft} />
      </View>
      <AppText style={styles.rowText}>{children}</AppText>
    </View>
  );
}

/**
 * A numbered step row (How it works): a small accent circle with the number, a bold one-line
 * title (16 / 600) and one short sentence (14, muted). The number is part of the spoken label.
 */
export function OnboardingNumberedStep({
  number,
  title,
  body,
}: {
  number: number;
  title: string;
  body: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={`onboarding-numbered-${number}`}
      accessible
      accessibilityLabel={`${number}. ${title}. ${body}`}
      style={[styles.row, { gap: theme.space(3) }]}
    >
      <View
        style={[
          styles.badge,
          { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill },
        ]}
      >
        <AppText variant="h3" style={{ color: theme.colors.onAccent }}>
          {String(number)}
        </AppText>
      </View>
      <View style={styles.rowText}>
        <AppText variant="h3">{title}</AppText>
        <AppText tone="muted">{body}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MAX_READABLE_WIDTH, alignSelf: 'center' },
  hero: { alignItems: 'center' },
  centre: { textAlign: 'center' },
  lead: { maxWidth: LEAD_MAX_WIDTH },
  skip: { alignItems: 'flex-end' },
  progress: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dots: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowText: { flex: 1, flexShrink: 1, gap: 2 },
  // min sizes (not fixed): the number grows with the OS text size
  badge: {
    minWidth: space(9),
    minHeight: space(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
