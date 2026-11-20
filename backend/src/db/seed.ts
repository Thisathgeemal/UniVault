/**
 * Loads the synthetic seed data (backend/seed-data, from scripts/generate-synthetic-data.mjs)
 * into the database: issuers, one admin and one officer per issuer, and holder records.
 *
 * Safe to run repeatedly: existing rows (same issuer ID / staff email /
 * issuer + external reference) are left unchanged.
 * Credential records and offers are NOT seeded – they are created through the
 * issuance API, which signs them with the issuer's real key.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../lib/passwords.js';
import type { Db } from './client.js';
import { holders, issuerStaff, issuers, type NewHolder } from './schema.js';

export const SEED_DATA_DIR = fileURLToPath(new URL('../../seed-data/', import.meta.url));
export const DEFAULT_SEED_PASSWORD = 'UniVault-Dev-2026!';

interface SeedIssuer {
  issuer_key: string;
  issuer_type: 'employer' | 'bank';
  name: string;
  email_domain?: string;
}
interface SeedRecord {
  _synthetic: true;
  record_id: string;
  person_id: string;
  issuer_key: string;
  credential_type: 'EmploymentCredential' | 'KYCCredential';
  claims: Record<string, unknown> & { full_name: string; employee_id?: string };
}

export interface SeedResult {
  issuers: number;
  staff: number;
  holders: number;
  staffLogins: { email: string; role: string }[];
}

async function readJson<T>(dir: string, file: string): Promise<T> {
  return JSON.parse(await readFile(join(dir, file), 'utf8')) as T;
}

export async function seedDatabase(
  db: Db,
  options: { dataDir?: string; staffPassword?: string } = {},
): Promise<SeedResult> {
  const dir = options.dataDir ?? SEED_DATA_DIR;
  const issuerFile = await readJson<{ _synthetic: true; issuers: SeedIssuer[] }>(
    dir,
    'issuers.json',
  );
  const employees = await readJson<{ records: SeedRecord[] }>(dir, 'employees.json');
  const customers = await readJson<{ records: SeedRecord[] }>(dir, 'customers.json');
  if (issuerFile._synthetic !== true)
    throw new Error('Refusing to seed: data is not marked _synthetic');

  const passwordHash = await hashPassword(options.staffPassword ?? DEFAULT_SEED_PASSWORD);

  return db.transaction(async (tx) => {
    const insertedIssuers = await tx
      .insert(issuers)
      .values(
        issuerFile.issuers.map((i) => ({
          id: i.issuer_key,
          name: i.name,
          issuerType: i.issuer_type,
          emailDomain: i.email_domain ?? `${i.issuer_key}.example`,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: issuers.id });

    const staffRows = issuerFile.issuers.flatMap((i) => {
      const domain = i.email_domain ?? `${i.issuer_key}.example`;
      return [
        {
          issuerId: i.issuer_key,
          email: `admin@${domain}`,
          displayName: `${i.name} Admin`,
          role: 'admin' as const,
        },
        {
          issuerId: i.issuer_key,
          email: `officer@${domain}`,
          displayName: `${i.name} Officer`,
          role: 'officer' as const,
        },
      ];
    });
    const insertedStaff = await tx
      .insert(issuerStaff)
      .values(staffRows.map((s) => ({ ...s, passwordHash })))
      .onConflictDoNothing()
      .returning({ id: issuerStaff.id });

    const holderRows: NewHolder[] = [...employees.records, ...customers.records].map((r) => ({
      issuerId: r.issuer_key,
      recordType: r.credential_type === 'EmploymentCredential' ? 'employee' : 'customer',
      externalRef: r.claims.employee_id ?? r.record_id,
      fullName: r.claims.full_name,
      claims: r.claims,
      subjectRef: r.person_id,
    }));
    const insertedHolders = holderRows.length
      ? await tx
          .insert(holders)
          .values(holderRows)
          .onConflictDoNothing()
          .returning({ id: holders.id })
      : [];

    return {
      issuers: insertedIssuers.length,
      staff: insertedStaff.length,
      holders: insertedHolders.length,
      staffLogins: staffRows.map((s) => ({ email: s.email, role: s.role })),
    };
  });
}
