import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Button } from './Button';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Default: "Cancel". */
  cancelLabel?: string;
  /** Red confirm button, for actions that remove or cannot be undone. */
  destructive?: boolean;
  /** Spinner on the confirm button while the action runs. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * A modal question with Cancel and Confirm. Android's back button and a tap outside the dialog
 * cancel (onRequestClose); screen readers stay inside it (accessibilityViewIsModal). The
 * buttons stack vertically so long labels and large text sizes still fit.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      testID={testID ? `${testID}-modal` : undefined}
    >
      <View style={[styles.backdrop, { padding: theme.space(6) }]}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onCancel}
          testID={testID ? `${testID}-backdrop` : undefined}
          style={[StyleSheet.absoluteFill, styles.scrim, { backgroundColor: theme.colors.brand }]}
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[
            styles.dialog,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              padding: theme.space(5),
              gap: theme.space(3),
            },
          ]}
        >
          <AppText variant="h2" accessibilityRole="header">
            {title}
          </AppText>
          <AppText>{message}</AppText>
          <View style={{ gap: theme.space(2) }}>
            <Button
              label={confirmLabel}
              variant={destructive ? 'destructive' : 'primary'}
              loading={loading}
              onPress={onConfirm}
              testID={testID ? `${testID}-confirm` : undefined}
            />
            <Button
              label={cancelLabel ?? t('common.cancel')}
              variant="secondary"
              disabled={loading}
              onPress={onCancel}
              testID={testID ? `${testID}-cancel` : undefined}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center' },
  scrim: { opacity: 0.6 },
  dialog: { borderWidth: 1, maxWidth: 480, width: '100%', alignSelf: 'center' },
});
