/**
 * Diagnostics (DEVELOPMENT BUILDS ONLY): build facts, the configured API URL, a crypto-core
 * check on a bundled synthetic SD-JWT, an API reachability check (GET /health) and "Reset
 * onboarding" (clears the onboarding, privacy and security-setup flags; keeps language and
 * appearance; the gate then opens onboarding).
 * In a release build (`__DEV__` false) the screen shows only "not available"; the inline
 * `!__DEV__` gate lets Metro drop everything below it from release bundles.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Screen,
  useToast,
} from '../../../src/components';
import {
  diagnosticsEnabled,
  getAppInfo,
  onboardingResetEnabled,
} from '../../../src/config/app-info';
import { getApiConfig } from '../../../src/config/env';
import { runCryptoCoreCheck, type CryptoCheckResult } from '../../../src/lib/crypto-check';
import { useSetup } from '../../../src/onboarding/SetupProvider';
import { checkHealth, getApiClient, type HealthResult } from '../../../src/services/api-client';

function Row({
  label,
  value,
  mono = false,
  testID,
}: {
  label: string;
  value: string;
  /** Addresses and ids in mono (the only screen in the wallet that uses it). */
  mono?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="label">{label}</AppText>
      <AppText variant={mono ? 'mono' : 'body'} tone="muted" testID={testID} selectable>
        {value}
      </AppText>
    </View>
  );
}

function ResultBadge({ pass, testID }: { pass: boolean | null; testID: string }) {
  const { t } = useTranslation();
  if (pass === null)
    return <Badge label={t('diagnostics.notRun')} tone="neutral" testID={testID} />;
  return (
    <Badge
      label={pass ? t('diagnostics.pass') : t('diagnostics.fail')}
      // a check result, like a verification: passed = valid colours, failed = revoked colours
      tone={pass ? 'valid' : 'revoked'}
      icon={pass ? 'checkmark-circle' : 'close-circle'}
      testID={testID}
    />
  );
}

/** Reset onboarding (development builds only), behind a confirmation. */
function ResetOnboardingCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const { resetOnboarding } = useSetup();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    const done = await resetOnboarding();
    setBusy(false);
    setConfirming(false);
    toast.show({
      message: done ? t('diagnostics.resetDone') : t('diagnostics.resetFailed'),
      tone: done ? 'success' : 'danger',
    });
  };

  return (
    <Card title={t('diagnostics.resetTitle')} testID="reset-onboarding">
      <AppText tone="muted">{t('diagnostics.resetDescription')}</AppText>
      <Button
        variant="secondary"
        label={t('diagnostics.resetButton')}
        onPress={() => setConfirming(true)}
        testID="reset-onboarding-button"
      />
      <ConfirmDialog
        visible={confirming}
        title={t('diagnostics.resetConfirmTitle')}
        message={t('diagnostics.resetConfirmMessage')}
        confirmLabel={t('diagnostics.resetConfirm')}
        destructive
        loading={busy}
        onConfirm={() => void reset()}
        onCancel={() => setConfirming(false)}
        testID="reset-onboarding-dialog"
      />
    </Card>
  );
}

export default function DiagnosticsScreen() {
  const { t } = useTranslation();
  const [crypto, setCrypto] = useState<CryptoCheckResult | null>(null);
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  const runCrypto = useCallback(async () => {
    setCryptoBusy(true);
    try {
      setCrypto(await runCryptoCoreCheck());
    } finally {
      setCryptoBusy(false);
    }
  }, []);

  const runHealth = useCallback(async () => {
    setHealthBusy(true);
    try {
      setHealth(await checkHealth(getApiClient()));
    } finally {
      setHealthBusy(false);
    }
  }, []);

  if (!__DEV__ || !diagnosticsEnabled()) {
    return (
      <Screen testID="diagnostics-screen">
        <AppText>{t('diagnostics.unavailable')}</AppText>
      </Screen>
    );
  }

  const info = getAppInfo();
  const api = getApiConfig();

  return (
    <Screen testID="diagnostics-screen">
      <AppText tone="muted">{t('diagnostics.intro')}</AppText>

      <Card title={t('diagnostics.environment')}>
        <Row label={t('diagnostics.appVersion')} value={info.appVersion} />
        <Row label={t('diagnostics.sdkVersion')} value={info.sdkVersion} />
        <Row label={t('diagnostics.platform')} value={info.platform} />
        <Row
          label={t('diagnostics.hermes')}
          value={info.hermes ? t('diagnostics.on') : t('diagnostics.off')}
          testID="diag-hermes"
        />
        <Row
          label={t('diagnostics.apiBaseUrl')}
          value={api.apiBaseUrl ?? t(`diagnostics.apiProblem.${api.problem ?? 'missing'}`)}
          mono={api.apiBaseUrl !== null}
          testID="diag-api-url"
        />
        {api.isLoopback ? (
          <AppText tone="error" testID="diag-loopback">
            {t('diagnostics.loopbackWarning')}
          </AppText>
        ) : null}
      </Card>

      <Card title={t('diagnostics.cryptoTitle')} testID="crypto-check">
        <AppText tone="muted">{t('diagnostics.cryptoDescription')}</AppText>
        <ResultBadge pass={crypto ? crypto.pass : null} testID="crypto-result" />
        {crypto ? (
          <>
            <AppText testID="crypto-disclosures">
              {t('diagnostics.disclosures', {
                count: crypto.disclosures,
                expected: crypto.expectedDisclosures,
              })}
            </AppText>
            <AppText variant="caption" tone="muted">
              {t('diagnostics.duration', { ms: crypto.durationMs })}
            </AppText>
            {crypto.failure ? (
              <AppText tone="error">{t('diagnostics.reason', { reason: crypto.failure })}</AppText>
            ) : null}
          </>
        ) : null}
        <Button
          label={cryptoBusy ? t('common.running') : t('diagnostics.run')}
          accessibilityLabel={t('diagnostics.runLabel', { name: t('diagnostics.cryptoTitle') })}
          loading={cryptoBusy}
          onPress={() => void runCrypto()}
          testID="run-crypto-check"
        />
      </Card>

      <Card title={t('diagnostics.apiTitle')} testID="api-check">
        <AppText tone="muted">{t('diagnostics.apiDescription')}</AppText>
        <ResultBadge pass={health ? health.reachable : null} testID="api-result" />
        {health ? (
          <>
            <AppText testID="api-detail">
              {health.reachable
                ? t('diagnostics.reachable', {
                    status: health.serverStatus ?? '',
                    http: health.httpStatus,
                  })
                : t('diagnostics.unreachable', { code: health.errorCode ?? '' })}
            </AppText>
            <AppText variant="caption" tone="muted">
              {t('diagnostics.duration', { ms: health.durationMs })}
            </AppText>
          </>
        ) : null}
        {api.apiBaseUrl ? null : <AppText tone="error">{t('diagnostics.notConfigured')}</AppText>}
        {/* one primary action per screen: the crypto check is primary, this one secondary */}
        <Button
          variant="secondary"
          label={healthBusy ? t('common.running') : t('diagnostics.run')}
          accessibilityLabel={t('diagnostics.runLabel', { name: t('diagnostics.apiTitle') })}
          loading={healthBusy}
          disabled={!api.apiBaseUrl}
          onPress={() => void runHealth()}
          testID="run-api-check"
        />
      </Card>

      {onboardingResetEnabled() ? <ResetOnboardingCard /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
});
