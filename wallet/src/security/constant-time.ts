/**
 * Compares two byte arrays in time that depends only on their length, never on where they first
 * differ (no early exit), so the comparison does not leak how much of a derived PIN hash matched.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false; // lengths are public (both 32 for a verifier)
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
