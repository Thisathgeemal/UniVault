/**
 * Toast: short, non-blocking messages ("Language changed"), one at a time from a simple FIFO
 * queue. Shown at the top of the screen below the safe area (clear of the tab bar), announced to
 * screen readers, dismissed after `durationMs` or with its close button. Never put credential
 * data or error details in a toast.
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
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../theme';
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
    if (!current) return undefined;
    AccessibilityInfo.announceForAccessibility(current.message);
    const timer = setTimeout(dismiss, durationMs);
    return () => clearTimeout(timer);
  }, [current, dismiss, durationMs]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? <ToastView key={current.id} toast={current} onDismiss={dismiss} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: QueuedToast; onDismiss: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // inverted colours (foreground as background): stands out in light and dark mode
  const fg = theme.colors.bg;
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        { top: insets.top + theme.space(2), left: theme.space(4), right: theme.space(4) },
      ]}
    >
      <View
        testID="toast"
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
        ]}
      >
        <Icon name={ICONS[toast.tone]} color={fg} />
        <AppText accessibilityRole="alert" style={[styles.message, { color: fg }]}>
          {toast.message}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('toast.dismiss')}
          onPress={onDismiss}
          testID="toast-dismiss"
          style={styles.close}
        >
          <Icon name="close" size={20} color={fg} />
        </Pressable>
      </View>
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
