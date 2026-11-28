/**
 * PinCheck: enter the PIN and check it (the PIN prompt the app-lock and share-approval tasks put
 * on their screens). The processing pattern of design-system.md: once 6 digits are entered the
 * entry is cleared, the keypad is disabled and "Checking your PIN…" is shown (announced) while
 * verifyPin runs, for at least PROCESSING_MIN_MS; then `onResult(true | false)`. A wrong PIN
 * shakes the dots (not with reduce motion). The PIN never leaves this component except as the
 * argument to `verify`.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { PinPad } from '../components/PinPad';
import { ProcessingState } from '../components/ProcessingState';
import { withMinimumDuration, yieldToUi } from '../lib/timing';
import { useTheme } from '../theme/use-theme';
import { verifyPin } from './pin';

export interface PinCheckProps {
  onResult: (correct: boolean) => void;
  /** The check (default verifyPin); tests and later callers may pass their own. */
  verify?: (pin: string) => Promise<boolean>;
  testID?: string;
}

export function PinCheck({ onResult, verify = verifyPin, testID = 'pin-check' }: PinCheckProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [entry, setEntry] = useState('');
  const [checking, setChecking] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  const check = async (pin: string) => {
    setEntry(''); // the PIN leaves state at once
    setChecking(true);
    await yieldToUi(); // draw "Checking your PIN…" before the hash starts
    const correct = await withMinimumDuration(() => verify(pin));
    setChecking(false);
    if (!correct) setErrorCount((n) => n + 1);
    onResult(correct);
  };

  return (
    <View testID={testID} style={{ gap: theme.space(6) }}>
      <PinPad
        value={entry}
        onChange={setEntry}
        onComplete={(pin) => void check(pin)}
        errorCount={errorCount}
        disabled={checking}
      />
      {checking ? (
        <ProcessingState message={t('pin.checking')} testID={`${testID}-checking`} />
      ) : null}
    </View>
  );
}
