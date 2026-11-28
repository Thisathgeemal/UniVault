import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { WalletStatus } from '../credentials/status';
import { formatDate } from '../lib/format';
import { MIN_TOUCH_TARGET } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { StatusBadge } from './StatusBadge';

export interface CredentialCardProps {
  issuerName: string;
  /** Already translated, e.g. "Employment credential". */
  typeLabel: string;
  holderName: string;
  /** ISO 8601 expiry instant. */
  expiresAt: string;
  status: WalletStatus;
  onPress?: () => void;
  testID?: string;
}

/** First letter of the issuer's name for the avatar (first code point; "?" if empty). */
export const issuerInitial = (name: string): string =>
  Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';

/**
 * One credential, drawn in brand navy with radius-lg (design system: the wallet's 30 %): the
 * credential title in on-brand, the issuer and expiry in on-brand-muted, the holder in on-brand,
 * an issuer initial on a role-tag-bg circle, and the status badge in its OWN status-*-bg pill
 * (a status icon never sits straight on navy). Pressable as ONE element (role "button") whose
 * spoken label reads all of it, status included.
 */
export function CredentialCard({
  issuerName,
  typeLabel,
  holderName,
  expiresAt,
  status,
  onPress,
  testID,
}: CredentialCardProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const date = formatDate(expiresAt, i18n.language);
  const expiry =
    status === 'expired'
      ? t('credentialCard.expiredOn', { date })
      : t('credentialCard.expires', { date });
  const label = [
    typeLabel,
    t('credentialCard.issuedBy', { issuer: issuerName }),
    t('credentialCard.holder', { name: holderName }),
    expiry,
    t('credentialCard.statusLabel', { status: t(`status.${status}`) }),
  ].join(', ');

  const content = (
    <>
      <View style={[styles.top, { gap: theme.space(3) }]}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.avatar,
            { backgroundColor: theme.colors.roleTagBg, borderRadius: theme.radius.pill },
          ]}
        >
          <AppText variant="h3" tone="onBrand">
            {issuerInitial(issuerName)}
          </AppText>
        </View>
        <View style={styles.titles}>
          <AppText variant="bodySm" tone="onBrandMuted">
            {issuerName}
          </AppText>
          <AppText variant="h3" tone="onBrand">
            {typeLabel}
          </AppText>
        </View>
      </View>
      <AppText tone="onBrand">{holderName}</AppText>
      <AppText variant="caption" tone="onBrandMuted">
        {expiry}
      </AppText>
      <StatusBadge status={status} />
    </>
  );

  const cardStyle = {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.lg,
    padding: theme.space(4),
    gap: theme.space(2),
  };

  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={[styles.card, cardStyle]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('credentialCard.openHint')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        cardStyle,
        pressed ? { backgroundColor: theme.colors.brandHover } : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: MIN_TOUCH_TARGET },
  top: { flexDirection: 'row', alignItems: 'center' },
  // min sizes, not fixed: the initial grows with the OS text size
  avatar: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, flexShrink: 1 },
});
