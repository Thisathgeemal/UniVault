/**
 * "An authentication of ours is running" (the OS biometric prompt, the PIN prompt, biometric
 * enrolment). On some devices the system biometric sheet moves the app to 'inactive' or even
 * 'background'; the app lock (src/security/app-lock.tsx) must not treat that as leaving the app,
 * so it asks here first. A counter, so overlapping flows are counted correctly.
 */
let active = 0;
const endListeners = new Set<() => void>();

/** Marks an authentication as running; call the returned function exactly once when it ends. */
export function beginAuthActivity(): () => void {
  active += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    active -= 1;
    // every prompt that resolves gives the app lock a chance to re-check (src/security/app-lock.tsx)
    for (const listener of [...endListeners]) listener();
  };
}

export const isAuthActive = (): boolean => active > 0;

/** Called whenever one of our authentication activities ends; returns the unsubscribe. */
export function onAuthActivityEnd(listener: () => void): () => void {
  endListeners.add(listener);
  return () => {
    endListeners.delete(listener);
  };
}

/** Tests only (test/setup.ts): a prompt left open at the end of a test must not leak into the next. */
export function resetAuthActivity(): void {
  active = 0;
}

/** Runs `task` as an authentication activity. */
export async function withAuthActivity<T>(task: () => Promise<T>): Promise<T> {
  const end = beginAuthActivity();
  try {
    return await task();
  } finally {
    end();
  }
}
