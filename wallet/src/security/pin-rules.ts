/**
 * Wallet PIN rules (docs/security/wallet-pin.md §4): exactly 6 digits, and not one of the PINs
 * people choose most often. Pure functions, no I/O; the PIN is never logged or put in a message.
 *
 * Rejected ("too easy to guess"):
 *   - all the same digit: 000000 … 999999
 *   - a run of consecutive digits, up or down, wrapping past 0/9: 123456, 234567, 890123,
 *     012345, 654321, 098765, 210987 …
 *   - a repeated block: ababab (121212, 696969) and abcabc (123123, 520520)
 *   - pairs counting up or down: 112233, 445566, 998877
 *   - a mirrored half: abccba (123321, 456654)
 *   - COMMON_PINS: other PINs at the top of published lists of real 6-digit PINs (keypad
 *     patterns such as 159753 or 147258); see wallet-pin.md for the sources and reasoning.
 * Together they reject 2,053 of the 1,000,000 PINs (0.21 %, counted in test/pin-rules.test.ts):
 * the point is to remove the guesses an attacker tries FIRST, not to shrink the space.
 */

export const PIN_LENGTH = 6;

export type PinProblem = 'format' | 'weak';

/** Six ASCII digits, nothing else. */
export const isPinFormat = (pin: string): boolean => /^\d{6}$/.test(pin);

const digitsOf = (pin: string): number[] => [...pin].map(Number);

/** 000000 … 999999. */
export function isAllSame(pin: string): boolean {
  return isPinFormat(pin) && new Set(pin).size === 1;
}

/** Every step +1 or every step −1 (mod 10, so 890123 and 098765 count). */
export function isSequence(pin: string): boolean {
  if (!isPinFormat(pin)) return false;
  const d = digitsOf(pin);
  const steps = d.slice(1).map((x, i) => (x - d[i]! + 10) % 10);
  return steps.every((s) => s === 1) || steps.every((s) => s === 9);
}

/** ababab or abcabc. */
export function isRepeatedBlock(pin: string): boolean {
  if (!isPinFormat(pin)) return false;
  return pin.slice(0, 2).repeat(3) === pin || pin.slice(0, 3).repeat(2) === pin;
}

/** aabbcc with a, b, c consecutive up or down (mod 10): 112233, 998877, 889900. */
export function isCountingPairs(pin: string): boolean {
  if (!isPinFormat(pin)) return false;
  const [a, a2, b, b2, c, c2] = digitsOf(pin) as [number, number, number, number, number, number];
  if (a !== a2 || b !== b2 || c !== c2) return false;
  const up = (b - a + 10) % 10 === 1 && (c - b + 10) % 10 === 1;
  const down = (a - b + 10) % 10 === 1 && (b - c + 10) % 10 === 1;
  return up || down;
}

/** abccba: the second half mirrors the first (123321). */
export function isMirrored(pin: string): boolean {
  return isPinFormat(pin) && pin.slice(3) === [...pin.slice(0, 3)].reverse().join('');
}

/**
 * Common 6-digit PINs that the structural rules above do not already catch, from the top of the
 * published lists (wallet-pin.md §4): keypad lines and diagonals, and frequent number patterns.
 */
export const COMMON_PINS: ReadonlySet<string> = new Set([
  '159753', // keypad: diagonal crosses
  '159357',
  '753951',
  '147258', // keypad: columns
  '147852',
  '258369',
  '369258',
  '741852',
  '852963',
  '963852',
  '789456', // keypad: rows read in an unusual order
  '456123',
  '321654',
  '123654',
  '102030',
  '111222',
  '222333',
  '000111',
  '200000',
  '111000',
  '123000',
  '666999',
  '142536',
]);

/** null if the PIN may be used; otherwise why not (the message never contains the PIN). */
export function pinProblem(pin: string): PinProblem | null {
  if (!isPinFormat(pin)) return 'format';
  if (
    isAllSame(pin) ||
    isSequence(pin) ||
    isRepeatedBlock(pin) ||
    isCountingPairs(pin) ||
    isMirrored(pin) ||
    COMMON_PINS.has(pin)
  ) {
    return 'weak';
  }
  return null;
}

export const isAcceptablePin = (pin: string): boolean => pinProblem(pin) === null;
