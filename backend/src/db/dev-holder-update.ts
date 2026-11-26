/**
 * DEVELOPMENT ONLY: change ONE text claim of a holder record, so a reissue has a real
 * difference to show (there is no holder edit endpoint or page yet; see the backlog).
 *
 *   npm run db:holder:set -- <externalRef> <claim> <value>
 *   e.g. npm run db:holder:set -- STC-00003 designation "Senior HR Executive"
 *
 * Rules: refused in production; the reference must match exactly one holder; only an existing
 * TEXT claim may change, never the reference itself (employee_id) or a derived claim
 * (age_over_18); the changed record must still pass its credential schema (the same
 * validation as POST /holders). full_name also updates the holders.full_name column. Prints
 * the holder id and the claim NAME only, never values.
 */
import { eq } from 'drizzle-orm';
import type { CredentialSchemas } from '../services/credential-schemas.js';
import type { Db } from './client.js';
import { holders } from './schema.js';

const CREDENTIAL_TYPE = { employee: 'EmploymentCredential', customer: 'KYCCredential' } as const;
const LOCKED_CLAIMS = new Set(['employee_id', 'age_over_18']);

export class DevHolderUpdateError extends Error {}

export interface DevHolderUpdate {
  externalRef: string;
  claim: string;
  value: string;
  nodeEnv: string;
}

export async function devUpdateHolderClaim(
  db: Db,
  schemas: CredentialSchemas,
  update: DevHolderUpdate,
): Promise<{ holderId: string; claim: string }> {
  if (update.nodeEnv === 'production') {
    throw new DevHolderUpdateError('db:holder:set is disabled in production');
  }
  const found = await db.select().from(holders).where(eq(holders.externalRef, update.externalRef));
  if (found.length !== 1) {
    throw new DevHolderUpdateError(
      found.length === 0
        ? `No holder with reference ${update.externalRef}`
        : `${found.length} holders have reference ${update.externalRef}; it must be unique`,
    );
  }
  const holder = found[0]!;
  if (LOCKED_CLAIMS.has(update.claim)) {
    throw new DevHolderUpdateError(`${update.claim} cannot be changed with this command`);
  }
  if (typeof holder.claims[update.claim] !== 'string') {
    throw new DevHolderUpdateError(
      `${update.claim} is not an existing text claim of this holder record`,
    );
  }
  const claims = { ...holder.claims, [update.claim]: update.value };
  const issues = schemas.validate(CREDENTIAL_TYPE[holder.recordType], claims);
  if (issues.length > 0) {
    throw new DevHolderUpdateError(
      `The changed record would not pass the schema: ${issues
        .map((i) => `${i.path} ${i.message}`)
        .join('; ')}`,
    );
  }
  await db
    .update(holders)
    .set({
      claims,
      ...(update.claim === 'full_name' ? { fullName: update.value } : {}),
      updatedAt: new Date(),
    })
    .where(eq(holders.id, holder.id));
  return { holderId: holder.id, claim: update.claim };
}
