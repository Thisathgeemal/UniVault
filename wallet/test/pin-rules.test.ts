/**
 * PIN rules (src/security/pin-rules.ts): exactly 6 digits; every weak pattern is refused; ordinary
 * PINs pass. The message for a weak PIN is fixed and never contains the PIN.
 */
import { en } from '../src/i18n/locales/en';
import {
  COMMON_PINS,
  isAcceptablePin,
  isAllSame,
  isCountingPairs,
  isMirrored,
  isPinFormat,
  isRepeatedBlock,
  isSequence,
  pinProblem,
} from '../src/security/pin-rules';

const all = Array.from({ length: 1_000_000 }, (_, i) => String(i).padStart(6, '0'));

describe('format', () => {
  it.each(['', '12345', '1234567', '12a456', ' 12345', '１２３４５６', '12 456', '-12345'])(
    '"%s" is not six digits',
    (pin) => {
      expect(isPinFormat(pin)).toBe(false);
      expect(pinProblem(pin)).toBe('format');
    },
  );

  it('six ASCII digits are the format', () => {
    expect(isPinFormat('274913')).toBe(true);
  });
});

describe('weak PINs are refused', () => {
  it.each(['000000', '111111', '555555', '999999'])('all the same: %s', (pin) => {
    expect(isAllSame(pin)).toBe(true);
    expect(pinProblem(pin)).toBe('weak');
  });

  it('all ten repeated-digit PINs', () => {
    expect(all.filter(isAllSame)).toHaveLength(10);
  });

  it.each([
    '123456',
    '234567',
    '345678',
    '456789',
    '567890',
    '678901',
    '789012',
    '890123',
    '901234',
    '012345',
    '654321',
    '765432',
    '987654',
    '098765',
    '109876',
    '210987',
    '543210',
  ])('consecutive (up, down or wrapping): %s', (pin) => {
    expect(isSequence(pin)).toBe(true);
    expect(pinProblem(pin)).toBe('weak');
  });

  it('exactly 20 sequences (10 up, 10 down)', () => {
    expect(all.filter(isSequence)).toHaveLength(20);
  });

  it.each(['121212', '696969', '909090', '123123', '520520', '007007', '456456'])(
    'a repeated block: %s',
    (pin) => {
      expect(isRepeatedBlock(pin)).toBe(true);
      expect(pinProblem(pin)).toBe('weak');
    },
  );

  it.each(['112233', '445566', '998877', '889900', '221100'])('counting pairs: %s', (pin) => {
    expect(isCountingPairs(pin)).toBe(true);
    expect(pinProblem(pin)).toBe('weak');
  });

  it.each(['123321', '456654', '112211', '908809'])('mirrored: %s', (pin) => {
    expect(isMirrored(pin)).toBe(true);
    expect(pinProblem(pin)).toBe('weak');
  });

  it('the examples in the brief', () => {
    for (const pin of ['123123', '112233', '121212', '696969', '159753']) {
      expect([pin, pinProblem(pin)]).toEqual([pin, 'weak']);
    }
  });

  it('every blocklisted PIN is refused, and none is already caught by a pattern rule', () => {
    for (const pin of COMMON_PINS) {
      expect([pin, pinProblem(pin)]).toEqual([pin, 'weak']);
      const pattern =
        isAllSame(pin) ||
        isSequence(pin) ||
        isRepeatedBlock(pin) ||
        isCountingPairs(pin) ||
        isMirrored(pin);
      expect([pin, pattern]).toEqual([pin, false]);
      expect(isPinFormat(pin)).toBe(true);
    }
  });

  it('refuses 2,053 of the 1,000,000 PINs (0.21 %)', () => {
    expect(all.filter((pin) => pinProblem(pin) === 'weak')).toHaveLength(2053);
  });

  it('the message is the plain one from the brief and never contains a PIN', () => {
    expect(en.setup.weak).toBe(
      'This PIN is too easy to guess. Avoid repeated or consecutive numbers.',
    );
    expect(en.setup.weak).not.toMatch(/\d{6}/);
  });
});

describe('ordinary PINs pass', () => {
  it.each(['274913', '582047', '903618', '461705', '130596', '845210', '124578'])('%s', (pin) => {
    expect(pinProblem(pin)).toBeNull();
    expect(isAcceptablePin(pin)).toBe(true);
  });

  it('the pattern checks are false for malformed input (never throw)', () => {
    for (const check of [isAllSame, isSequence, isRepeatedBlock, isCountingPairs, isMirrored]) {
      expect(check('12')).toBe(false);
    }
  });
});
