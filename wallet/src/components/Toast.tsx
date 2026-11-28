/**
 * Toast: short, non-blocking messages ("Language changed"), one at a time from a simple FIFO
 * queue. Shown at the top of the screen below the safe area (clear of the tab bar), announced to
 * screen readers, dismissed after `durationMs`, with its close (×) button, by swiping it left or
 * right, or with the screen reader's "dismiss" action. Never put credential data or error details
 * in a toast.
 *
 * Swipe (react-native-gesture-handler + react-native-reanimated, design-system.md "Toast"): the
 * toast follows the finger horizontally; released past SWIPE_DISMISS_FRACTION of its width, or
 * flicked faster than SWIPE_FLICK_VELOCITY in the drag's direction, it slides out and is
 * dismissed; otherwise it springs back. The auto-dismiss timer pauses while the finger is on the
 * toast and resumes (with the time that was left) on release. Reduce motion: no slide or spring,
 * it is dismissed (or put back) at once.
 *
 *   <ToastProvider> … </ToastProvider>         (app/_layout.tsx)
 *   const toast = useToast(); toast.show({ message: t('…'), tone: 'success' });
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../theme';
import { useReduceMotion } from '../theme/reduce-motion';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ToastTone = 'success' | 'info' | 'danger';

export interface ToastMessage {
  message: string;
  tone?: ToastTone;
}

interface QueuedToast extends Required<ToastMessage> {
  id: number;
}

export interface ToastApi {
  show: (toast: ToastMessage) => void;
  dismiss: () => void;
}

/** At most this many toasts wait; older ones are dropped first (a burst must not pile up). */
export const TOAST_QUEUE_LIMIT = 3;
export const TOAST_DURATION_MS = 4000;
/** Released past this share of the toast's width: dismissed. */
export const SWIPE_DISMISS_FRACTION = 0.35;
/** A flick at least this fast (pt/s) in the drag's direction dismisses, whatever the distance. */
export const SWIPE_FLICK_VELOCITY = 800;
/** The slide-out after a swipe. */
export const SWIPE_OUT_MS = 180;

/** The swipe rule: far enough, or a fast flick the same way. */
export function shouldDismissSwipe(
  translationX: number,
  velocityX: number,
  width: number,
): boolean {
  if (Math.abs(translationX) >= SWIPE_DISMISS_FRACTION * width) return true;
  const sameWay = translationX === 0 || Math.sign(velocityX) === Math.sign(translationX);
  return Math.abs(velocityX) >= SWIPE_FLICK_VELOCITY && sameWay;
}

const ICONS: Record<ToastTone, IconName> = {
  success: 'checkmark-circle',
  info: 'information-circle',
  danger: 'alert-circle',
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast() needs a <ToastProvider> above it');
  return api;
}

export function ToastProvider({
  children,
  durationMs = TOAST_DURATION_MS,
}: {
  children: ReactNode;
  durationMs?: number;
}) {
  const [queue, setQueue] = useState<QueuedToast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((toast: ToastMessage) => {
    const id = nextId.current++;
    setQueue((current) =>
      [...current, { id, message: toast.message, tone: toast.tone ?? 'info' }].slice(
        -TOAST_QUEUE_LIMIT,
      ),
    );
  }, []);
  const dismiss = useCallback(() => setQueue((current) => current.slice(1)), []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const current = queue[0];
  useEffect(() => {
    if (current) AccessibilityInfo.announceForAccessibility(current.message);
  }, [current]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <ToastView key={current.id} toast={current} onDismiss={dismiss} durationMs={durationMs} />
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  onDismiss,
  durationMs,
}: {
  toast: QueuedToast;
  onDismiss: () => void;
  durationMs: number;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const windowSize = useWindowDimensions();
  // inverted colours (foreground as background): stands out in light and dark mode
  const fg = theme.colors.bg;

  // every way out (timer, ×, swipe, screen-reader action) dismisses THIS toast once only: a
  // second call would drop the next toast in the queue
  const done = useRef(false);
  const close = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onDismiss();
  }, [onDismiss]);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (slideTimer.current) clearTimeout(slideTimer.current);
    },
    [],
  );

  // the auto-dismiss timer, paused while a finger is on the toast (the time left is kept)
  const [held, setHeld] = useState(false);
  const remaining = useRef(durationMs);
  useEffect(() => {
    if (held) return undefined;
    const started = Date.now();
    const timer = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [held, close]);

  // the toast's width (until measured: the window minus the side margins)
  const width = useRef(windowSize.width - 2 * theme.space(4));
  const onLayout = (event: LayoutChangeEvent) => {
    width.current = event.nativeEvent.layout.width;
  };

  // get() / set(), not .value: the React Compiler treats hook results as read-only
  const translateX = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));
  const swipeOut = (direction: number) => {
    if (reduceMotion) {
      close(); // no slide
      return;
    }
    translateX.set(
      withTiming(direction * (width.current + theme.space(4)), { duration: SWIPE_OUT_MS }),
    );
    slideTimer.current = setTimeout(close, SWIPE_OUT_MS);
  };

  const pan = usePanGesture({
    testID: 'toast-swipe',
    runOnJS: true,
    // horizontal only: a vertical move fails the gesture (the screen below keeps scrolling)
    activeOffsetX: [-10, 10],
    failOffsetY: [-15, 15],
    onBegin: () => setHeld(true),
    onUpdate: (event) => {
      translateX.set(event.translationX);
    },
    onDeactivate: (event) => {
      if (shouldDismissSwipe(event.translationX, event.velocityX, width.current)) {
        swipeOut(Math.sign(event.translationX || event.velocityX));
      } else {
        translateX.set(reduceMotion ? 0 : withSpring(0));
      }
    },
    onFinalize: () => setHeld(false),
  });

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'dismiss') close();
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        { top: insets.top + theme.space(2), left: theme.space(4), right: theme.space(4) },
      ]}
    >
      <GestureDetector gesture={pan}>
        <Animated.View
          testID="toast"
          onLayout={onLayout}
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              backgroundColor: theme.colors.text,
              borderRadius: theme.radius.md,
              paddingLeft: theme.space(4),
              paddingVertical: theme.space(1),
              gap: theme.space(2),
            },
            animatedStyle,
          ]}
        >
          <Icon name={ICONS[toast.tone]} color={fg} />
          {/* screen readers cannot swipe: the message offers a "dismiss" action */}
          <AppText
            accessibilityRole="alert"
            accessibilityActions={[{ name: 'dismiss', label: t('toast.dismiss') }]}
            onAccessibilityAction={onAccessibilityAction}
            testID="toast-message"
            style={[styles.message, { color: fg }]}
          >
            {toast.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('toast.dismiss')}
            onPress={close}
            testID="toast-dismiss"
            style={styles.close}
          >
            <Icon name="close" size={20} color={fg} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute' },
  toast: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET },
  message: { flex: 1, flexShrink: 1 },
  close: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
