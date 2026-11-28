/**
 * UI kit (DEVELOPMENT BUILDS ONLY): every shared component and variant, every credential
 * status, buttons in every state, a CredentialCard per status, and Toast / ConfirmDialog
 * triggers, in the current language and colour scheme. For screenshots and visual review.
 * In a release build (`__DEV__` false) the screen shows only "not available" and Settings has
 * no link to it.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CredentialCard,
  EmptyState,
  ErrorState,
  Header,
  ListItem,
  OfflineNotice,
  LoadingState,
  Screen,
  Section,
  StatusBadge,
  useToast,
} from '../../../src/components';
import { uiKitEnabled } from '../../../src/config/app-info';
import { WALLET_STATUSES } from '../../../src/credentials/status';
import { SAMPLE_CREDENTIALS, sampleStatus } from '../../../src/fixtures/sample-data';
import { componentTokens } from '@univault/portal-ui/tokens';
import { BUTTON_VARIANTS, isNavyVariant, TONES } from '../../../src/theme';
import { useTheme } from '../../../src/theme/use-theme';

type DialogKind = 'confirm' | 'destructive' | null;

const DISCLOSURE = componentTokens.disclosurePanel;

/** One sample credential per wallet state (first match). */
const CARD_SAMPLES = WALLET_STATUSES.flatMap((status) => {
  const sample = SAMPLE_CREDENTIALS.find((c) => sampleStatus(c) === status);
  return sample ? [{ status, sample }] : [];
});

export default function UiKitScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogKind>(null);

  // inline __DEV__ first: Metro folds it to `true` in release builds and drops the kit below
  // (uiKitEnabled() alone is a call the minifier cannot fold); tests mock uiKitEnabled()
  if (!__DEV__ || !uiKitEnabled()) {
    return (
      <Screen testID="ui-kit-screen">
        <AppText>{t('uiKit.unavailable')}</AppText>
      </Screen>
    );
  }

  const pressed = () => toast.show({ message: t('uiKit.pressed') });
  const closeDialog = (confirmed: boolean) => {
    setDialog(null);
    toast.show({
      message: confirmed ? t('uiKit.confirmed') : t('uiKit.cancelled'),
      tone: confirmed ? 'success' : 'info',
    });
  };

  return (
    <Screen testID="ui-kit-screen">
      <AppText tone="muted">
        {t('uiKit.intro', {
          scheme: theme.scheme === 'dark' ? t('uiKit.schemeDark') : t('uiKit.schemeLight'),
        })}
      </AppText>

      <Section title={t('uiKit.sections.buttons')}>
        <Card testID="kit-buttons">
          {BUTTON_VARIANTS.map((variant) => {
            const name = t(`uiKit.variants.${variant}`);
            // the navy kinds only ever sit on navy (a header, a credential card, the lock screen)
            const onNavy = isNavyVariant(variant);
            const panelID = variant === 'onBrand' ? 'kit-on-brand-panel' : `kit-${variant}-panel`;
            return (
              <View
                key={variant}
                testID={onNavy ? panelID : undefined}
                style={[
                  { gap: theme.space(2) },
                  onNavy
                    ? {
                        backgroundColor: theme.colors.brand,
                        borderRadius: theme.radius.lg,
                        padding: theme.space(4),
                      }
                    : null,
                ]}
              >
                {onNavy ? (
                  <AppText variant="bodySm" tone="onBrandMuted">
                    {t(variant === 'inverse' ? 'uiKit.inverseSample' : 'uiKit.onBrandSample')}
                  </AppText>
                ) : null}
                <Button
                  label={name}
                  variant={variant}
                  onPress={pressed}
                  testID={`kit-${variant}`}
                />
                <Button
                  label={t('uiKit.disabled', { variant: name })}
                  variant={variant}
                  disabled
                  onPress={pressed}
                />
                <Button
                  label={t('uiKit.loading', { variant: name })}
                  variant={variant}
                  loading
                  onPress={pressed}
                />
              </View>
            );
          })}
          <Button label={t('uiKit.variants.primary')} icon="add" onPress={pressed} />
        </Card>
      </Section>

      <Section title={t('uiKit.sections.statuses')}>
        <Card testID="kit-statuses">
          <View style={[styles.wrap, { gap: theme.space(2) }]}>
            {WALLET_STATUSES.map((status) => (
              <StatusBadge key={status} status={status} testID={`kit-status-${status}`} />
            ))}
          </View>
        </Card>
      </Section>

      <Section title={t('uiKit.sections.badges')}>
        <Card testID="kit-badges">
          <View style={[styles.wrap, { gap: theme.space(2) }]}>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} label={t(`uiKit.tones.${tone}`)} />
            ))}
          </View>
        </Card>
      </Section>

      <Section title={t('uiKit.sections.cards')}>
        {CARD_SAMPLES.map(({ status, sample }) => (
          <CredentialCard
            key={status}
            testID={`kit-card-${status}`}
            issuerName={sample.issuerName}
            typeLabel={t(`credentialTypes.${sample.type}`)}
            holderName={sample.holderName}
            expiresAt={sample.expiresAt}
            status={status}
            onPress={pressed}
          />
        ))}
      </Section>

      <Section title={t('uiKit.sections.list')}>
        <Card testID="kit-list">
          <ListItem title={t('uiKit.listTitle')} />
          <ListItem
            icon="star-outline"
            title={t('uiKit.listTitle')}
            subtitle={t('uiKit.listSubtitle')}
          />
          <ListItem
            icon="language-outline"
            title={t('uiKit.listTitle')}
            value={t('uiKit.listValue')}
          />
          <ListItem
            icon="chevron-forward-circle-outline"
            title={t('uiKit.listTitle')}
            subtitle={t('uiKit.listSubtitle')}
            onPress={pressed}
          />
        </Card>
      </Section>

      <Section title={t('uiKit.sections.header')}>
        <View testID="kit-header" style={{ gap: theme.space(2) }}>
          {/* every tab screen and every screen inside a tab: the navy header */}
          <AppText tone="muted">{t('uiKit.headerInTabs')}</AppText>
          <Header title={t('uiKit.headerTitle')} tone="brand" testID="kit-header-root" />
          <Header
            title={t('uiKit.headerTitle')}
            tone="brand"
            onBack={pressed}
            actions={[
              { icon: 'share-outline', label: t('uiKit.headerAction'), onPress: pressed },
              { icon: 'ellipsis-horizontal', label: t('uiKit.headerAction2'), onPress: pressed },
            ]}
            testID="kit-header-detail"
          />
          {/* outside the tabs (not found, onboarding's Privacy details): the surface header */}
          <AppText tone="muted">{t('uiKit.headerOutside')}</AppText>
          <Header title={t('uiKit.headerTitle')} onBack={pressed} testID="kit-header-surface" />
        </View>
      </Section>

      <Section title={t('uiKit.sections.states')}>
        <Card testID="kit-states">
          <LoadingState message={t('uiKit.loadingMessage')} />
          <EmptyState
            icon="file-tray-outline"
            title={t('uiKit.emptyTitle')}
            message={t('uiKit.emptyMessage')}
          />
          <ErrorState message={t('uiKit.errorMessage')} onRetry={pressed} />
        </Card>
      </Section>

      <Section title={t('uiKit.sections.offline')}>
        <OfflineNotice lastChecked={t('uiKit.offlineSample')} testID="kit-offline" />
      </Section>

      <Section title={t('uiKit.sections.disclosure')}>
        {/* The disclosure screen's verifier panel (later task): componentTokens.disclosurePanel */}
        <View
          testID="kit-disclosure-panel"
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors[DISCLOSURE.bg],
              borderColor: theme.colors[DISCLOSURE.border],
              borderRadius: theme.radius.md,
              padding: theme.space(4),
              gap: theme.space(1),
            },
          ]}
        >
          <AppText variant="h3" style={{ color: theme.colors[DISCLOSURE.title] }}>
            {t('uiKit.disclosureVerifier')}
          </AppText>
          <AppText variant="bodySm" style={{ color: theme.colors[DISCLOSURE.body] }}>
            {t('uiKit.disclosurePurpose')}
          </AppText>
          <AppText accessibilityRole="link" style={{ color: theme.colors[DISCLOSURE.link] }}>
            {t('uiKit.disclosureLink')}
          </AppText>
        </View>
      </Section>

      <Section title={t('uiKit.sections.feedback')}>
        <Card testID="kit-feedback">
          <AppText tone="muted">{t('uiKit.swipeHint')}</AppText>
          <Button
            label={t('uiKit.showToast')}
            variant="secondary"
            onPress={() =>
              toast.show({ message: t('uiKit.toastMessage', { n: 1 }), tone: 'success' })
            }
            testID="kit-toast"
          />
          <Button
            label={t('uiKit.showThreeToasts')}
            variant="secondary"
            onPress={() => {
              for (const n of [1, 2, 3]) toast.show({ message: t('uiKit.toastMessage', { n }) });
            }}
            testID="kit-toasts"
          />
          <Button
            label={t('uiKit.confirm')}
            variant="secondary"
            onPress={() => setDialog('confirm')}
            testID="kit-confirm"
          />
          <Button
            label={t('uiKit.confirmDestructive')}
            variant="destructive"
            onPress={() => setDialog('destructive')}
            testID="kit-confirm-destructive"
          />
        </Card>

        <ConfirmDialog
          testID="kit-dialog"
          visible={dialog !== null}
          destructive={dialog === 'destructive'}
          title={dialog === 'destructive' ? t('uiKit.destructiveTitle') : t('uiKit.confirmTitle')}
          message={
            dialog === 'destructive' ? t('uiKit.destructiveMessage') : t('uiKit.confirmMessage')
          }
          confirmLabel={
            dialog === 'destructive' ? t('uiKit.destructiveAction') : t('uiKit.confirmAction')
          }
          onConfirm={() => closeDialog(true)}
          onCancel={() => closeDialog(false)}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  panel: { borderWidth: 1 },
});
