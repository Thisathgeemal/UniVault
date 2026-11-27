/**
 * "crypto-core check" for the Diagnostics screen: decodes the bundled synthetic SD-JWT with the
 * SHARED @univault/crypto-core (universal entry only) and re-validates every disclosure digest.
 * It proves that the same code the backend uses runs on this phone's JavaScript engine.
 *
 * Only counts and pass/fail are reported, never claim values (a habit for real credentials).
 */
import { decodeSdJwt, validateDisclosures } from '@univault/crypto-core';
import { DIAGNOSTICS_CREDENTIAL } from '../fixtures/diagnostics-credential';

export interface CryptoCheckResult {
  pass: boolean;
  disclosures: number;
  expectedDisclosures: number;
  durationMs: number;
  /** Why it failed (an error name or a short reason), never claim data. */
  failure: string | null;
}

export interface CryptoCheckFixture {
  sdJwt: string;
  disclosedClaims: readonly string[];
  vct: string;
}

export async function runCryptoCoreCheck(
  fixture: CryptoCheckFixture = DIAGNOSTICS_CREDENTIAL,
  now: () => number = Date.now,
): Promise<CryptoCheckResult> {
  const started = now();
  const expectedDisclosures = fixture.disclosedClaims.length;
  const result = (disclosures: number, failure: string | null): CryptoCheckResult => ({
    pass: failure === null,
    disclosures,
    expectedDisclosures,
    durationMs: now() - started,
    failure,
  });

  try {
    const decoded = await decodeSdJwt(fixture.sdJwt);
    const count = decoded.disclosures.length;
    const validation = validateDisclosures(
      decoded.disclosures.map((d) => d.encoded),
      decoded.payload,
    );
    if (!validation.valid) return result(count, validation.errors[0]?.code ?? 'INVALID');
    if (decoded.payload.vct !== fixture.vct) return result(count, 'WRONG_VCT');
    const names = decoded.disclosures.map((d) => d.name);
    const sameNames =
      names.length === expectedDisclosures &&
      fixture.disclosedClaims.every((name) => names.includes(name));
    return result(count, sameNames ? null : 'WRONG_DISCLOSURES');
  } catch (error) {
    return result(0, error instanceof Error ? error.name : 'Error');
  }
}
