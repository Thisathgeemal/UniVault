/**
 * Timing helpers for slow work the holder waits for (hashing or checking the PIN):
 *
 * - `yieldToUi()`: lets React draw the processing state (spinner, "Saving your PIN…") before a
 *   CPU-heavy task starts on the JS thread; the spinner itself is a native view and keeps turning
 *   while scrypt runs (scrypt also yields every 10 ms).
 * - `withMinimumDuration()`: keeps a processing state up for at least `ms`, so it never flickers
 *   on a fast phone; a failure is reported only after the same minimum.
 */

/** How long the processing state is shown at least (design-system.md, processing state). */
export const PROCESSING_MIN_MS = 600;

/** A pause long enough for one or two frames to be drawn. */
export const YIELD_MS = 32;

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function yieldToUi(): Promise<void> {
  return delay(YIELD_MS);
}

/** Runs `task` and resolves (or rejects) no earlier than `ms` after the start. */
export async function withMinimumDuration<T>(
  task: () => Promise<T>,
  ms: number = PROCESSING_MIN_MS,
): Promise<T> {
  const [result] = await Promise.allSettled([task(), delay(ms)]);
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}
