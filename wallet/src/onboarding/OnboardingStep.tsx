/**
 * The frame of every onboarding step (app/onboarding/*): an optional Skip (explanation steps
 * only, goes to Privacy), the illustration on a navy panel, the title and the step's text, and
 * a footer with the progress dots ("Step X of Y" for screen readers) and Back / Next.
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
import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
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

export interface OnboardingPrimary {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
}

export interface OnboardingStepProps {
  step: OnboardingStepId;
  title: string;
  illustration?: ReactNode;
  children: ReactNode;
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
  illustration,
  children,
  primary,
}: OnboardingStepProps) {
  const { t } = useTranslation();
  const theme = useTheme();
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
        contentContainerStyle={[styles.content, { padding: theme.space(4), gap: theme.space(4) }]}
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
        {illustration ? (
          <View
            testID="onboarding-illustration"
            style={{
              backgroundColor: theme.colors.brand,
              borderRadius: theme.radius.lg,
              padding: theme.space(4),
            }}
          >
            {illustration}
          </View>
        ) : null}
        <AppText variant="h1" accessibilityRole="header">
          {title}
        </AppText>
        {children}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            padding: theme.space(4),
            paddingBottom: insets.bottom + theme.space(4),
            gap: theme.space(3),
          },
        ]}
      >
        <ProgressDots current={stepNumber(step)} label={stepLabel} />
        <View style={[styles.buttons, { gap: theme.space(2) }]}>
          {goBack ? (
            <View style={styles.button}>
              <Button
                variant="secondary"
                label={t('common.back')}
                onPress={goBack}
                testID="onboarding-back"
              />
            </View>
          ) : null}
          {action ? (
            <View style={styles.button}>
              <Button
                label={action.label}
                onPress={action.onPress}
                disabled={action.disabled ?? false}
                {...(action.accessibilityHint
                  ? { accessibilityHint: action.accessibilityHint }
                  : {})}
                testID="onboarding-next"
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** One key point of a step: a decorative icon (text-muted, like list icons) and a sentence. */
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
    <View testID={testID} style={[styles.point, { gap: theme.space(3) }]}>
      <Icon name={icon} color={theme.colors.textMuted} />
      <AppText style={styles.pointText}>{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },
  skip: { alignItems: 'flex-end' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  progress: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dots: { flexDirection: 'row', alignItems: 'center' },
  // side by side; each wraps onto its own line when large text makes them too wide
  buttons: { flexDirection: 'row', flexWrap: 'wrap' },
  button: { flexGrow: 1, flexBasis: '40%' },
  point: { flexDirection: 'row', alignItems: 'flex-start' },
  pointText: { flex: 1, flexShrink: 1 },
});
