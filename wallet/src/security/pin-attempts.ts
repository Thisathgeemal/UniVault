/**
 * PIN attempt limits (Decision 026, docs/security/wallet-authentication.md §5), on the
 * failed-attempt record in the secure store (src/security/pin.ts: { failedAttempts, lockedUntil }),
 * so a lock survives app restarts.
 *
 * Schedule: the first 4 wrong PINs cost nothing; the 5th locks PIN entry for 30 s; every further
 * wrong PIN (after the lock ends) locks for the next step: 1 min, 5 min, 15 min, then 1 h for each
 * one after that. A correct PIN resets the count. No wipe yet (a wipe after N attempts is future
 * work). In the long run that is about one guess per hour: the 1,000,000 PINs would take over
 * 100 years.
 */
import { clearPinAttempts, readPinAttempts, verifyPin, writePinAttempts } from './pin';

export const FREE_ATTEMPTS = 4;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** Lock after the 5th, 6th, 7th, 8th and every later wrong PIN. */
export const LOCKOUT_SCHEDULE_MS = [
  30 * SECOND,
  MINUTE,
  5 * MINUTE,
  15 * MINUTE,
  60 * MINUTE,
] as const;

/** How long PIN entry is locked after this many failures in a row (0 = not locked). */
export function lockoutAfter(failedAttempts: number): number {
  if (failedAttempts <= FREE_ATTEMPTS) return 0;
  const step = Math.min(failedAttempts - FREE_ATTEMPTS - 1, LOCKOUT_SCHEDULE_MS.length - 1);
  return LOCKOUT_SCHEDULE_MS[step]!;
}

/** The instant (ms) PIN entry is locked until, or null when it is not locked now. */
export async function currentPinLock(now: number = Date.now()): Promise<number | null> {
  const { lockedUntil } = await readPinAttempts();
  if (lockedUntil === null) return null;
  const until = Date.parse(lockedUntil);
  return until > now ? until : null;
}

export type PinCheckResult =
  { ok: true } | { ok: false; lockedUntil: number | null; failedAttempts: number };

/**
 * Checks a PIN under the limits: refused without checking while locked; a wrong PIN counts and
 * may lock; a correct PIN clears the record. The result never contains the PIN.
 */
export async function checkPinWithLimits(
  pin: string,
  now: () => number = () => Date.now(),
): Promise<PinCheckResult> {
  const record = await readPinAttempts();
  const locked = await currentPinLock(now());
  if (locked !== null)
    return { ok: false, lockedUntil: locked, failedAttempts: record.failedAttempts };
  if (await verifyPin(pin)) {
    await clearPinAttempts().catch(() => undefined);
    return { ok: true };
  }
  const failedAttempts = record.failedAttempts + 1;
  const lockMs = lockoutAfter(failedAttempts);
  const lockedUntil = lockMs > 0 ? now() + lockMs : null;
  await writePinAttempts({
    failedAttempts,
    lockedUntil: lockedUntil === null ? null : new Date(lockedUntil).toISOString(),
  });
  return { ok: false, lockedUntil, failedAttempts };
}
