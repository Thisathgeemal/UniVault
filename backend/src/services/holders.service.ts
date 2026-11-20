/**
 * Holder records – the issuer's own records of employees (employers) and
 * customers (banks). Every operation is scoped to the logged-in staff member's
 * issuer: records of other issuers are invisible (reported as "not found").
 *
 * Claims are validated against the credential schema for the issuer's type
 * (docs/schemas), so only data that can become a valid credential is stored.
 * Personal data in claims is never written to logs.
 */
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { StaffProfile } from '../auth/auth-service.js';
import type { Db } from '../db/client.js';
import { holders } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import type { CredentialSchemas, CredentialTypeName } from './credential-schemas.js';

export type RecordType = 'employee' | 'customer';

/** What each issuer type keeps records of, and which credential those records become. */
export const ISSUER_RECORD_TYPES = {
  employer: { recordType: 'employee', credentialType: 'EmploymentCredential' },
  bank: { recordType: 'customer', credentialType: 'KYCCredential' },
} as const satisfies Record<
  StaffProfile['issuer']['type'],
  { recordType: RecordType; credentialType: CredentialTypeName }
>;

export const CUSTOMER_REF_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,29}$/;

export interface CreateHolderInput {
  /** Required for bank customers (customer number). For employees it is the employee_id claim. */
  externalRef?: string | undefined;
  claims: Record<string, unknown>;
}

export interface HolderSummary {
  id: string;
  externalRef: string;
  fullName: string;
  recordType: RecordType;
  credentialCount: number;
  createdAt: string;
}

export interface HolderDetail {
  id: string;
  issuerId: string;
  recordType: RecordType;
  credentialType: CredentialTypeName;
  externalRef: string;
  fullName: string;
  claims: Record<string, unknown>;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListHoldersQuery {
  search?: string | undefined;
  limit: number;
  offset: number;
  sort: 'newest' | 'name';
}

export interface HoldersService {
  create(staff: StaffProfile, input: CreateHolderInput): Promise<HolderDetail>;
  list(
    staff: StaffProfile,
    query: ListHoldersQuery,
  ): Promise<{ holders: HolderSummary[]; total: number; limit: number; offset: number }>;
  get(staff: StaffProfile, holderId: string): Promise<HolderDetail>;
}

export const holderNotFound = () =>
  new AppError(404, 'HOLDER_NOT_FOUND', 'Holder record not found');

/** Age in whole years on a given date (UTC), from an ISO YYYY-MM-DD date of birth. */
export function ageOn(dateOfBirth: string, on: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = on.getUTCFullYear() - year;
  const beforeBirthday =
    on.getUTCMonth() + 1 < month || (on.getUTCMonth() + 1 === month && on.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (current && typeof current === 'object') {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
function likePattern(search: string): string {
  return `%${search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function createHoldersService(
  db: Db,
  schemas: CredentialSchemas,
  now: () => Date = () => new Date(),
): HoldersService {
  const toDetail = (
    row: typeof holders.$inferSelect,
    createdBy: { id: string; displayName: string } | null,
  ): HolderDetail => ({
    id: row.id,
    issuerId: row.issuerId,
    recordType: row.recordType,
    credentialType: row.recordType === 'employee' ? 'EmploymentCredential' : 'KYCCredential',
    externalRef: row.externalRef,
    fullName: row.fullName,
    claims: row.claims,
    createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  const loadDetail = async (issuerId: string, holderId: string) => {
    const row = await db.query.holders.findFirst({
      where: and(eq(holders.id, holderId), eq(holders.issuerId, issuerId)), // issuer scope
      with: { createdBy: { columns: { id: true, displayName: true } } },
    });
    if (!row) throw holderNotFound();
    return toDetail(row, row.createdBy ?? null);
  };

  return {
    async create(staff, input) {
      const { recordType, credentialType } = ISSUER_RECORD_TYPES[staff.issuer.type];
      const claims: Record<string, unknown> = { ...input.claims };

      // age_over_18 is derived by the server (Decision 005) – a client value is never trusted
      if (credentialType === 'KYCCredential' && typeof claims.date_of_birth === 'string') {
        const age = ageOn(claims.date_of_birth, now());
        if (age !== null) claims.age_over_18 = age >= 18;
      }

      const issues = schemas
        .validate(credentialType, claims)
        .map((i) => ({ path: `claims.${i.path}`, message: i.message }));

      // The external reference: employee ID for employees, customer number for customers
      let externalRef: string | undefined;
      if (recordType === 'employee') {
        externalRef = typeof claims.employee_id === 'string' ? claims.employee_id : undefined;
        if (input.externalRef !== undefined && input.externalRef !== externalRef) {
          issues.push({
            path: 'externalRef',
            message: 'must equal claims.employee_id for employee records',
          });
        }
      } else {
        externalRef = input.externalRef;
        if (!externalRef)
          issues.push({
            path: 'externalRef',
            message: 'is required for bank customer records (customer number)',
          });
        else if (!CUSTOMER_REF_PATTERN.test(externalRef)) {
          issues.push({
            path: 'externalRef',
            message: 'must be 3–30 uppercase letters, digits or hyphens',
          });
        }
      }
      if (issues.length > 0 || !externalRef) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Holder data does not match the ${credentialType} schema`,
          issues,
        );
      }

      try {
        const [row] = await db
          .insert(holders)
          .values({
            issuerId: staff.issuer.id,
            recordType,
            externalRef,
            fullName: String(claims.full_name),
            claims,
            createdByStaffId: staff.id,
          })
          .returning();
        return toDetail(row!, { id: staff.id, displayName: staff.displayName });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new AppError(
            409,
            'HOLDER_ALREADY_EXISTS',
            `A holder with reference "${externalRef}" already exists`,
          );
        }
        throw err;
      }
    },

    async list(staff, query) {
      const conditions = [eq(holders.issuerId, staff.issuer.id)];
      if (query.search) {
        const pattern = likePattern(query.search);
        conditions.push(
          sql`(lower(${holders.fullName}) like ${pattern} escape '\\' or lower(${holders.externalRef}) like ${pattern} escape '\\')`,
        );
      }
      const where = and(...conditions);
      // Table aliases are explicit: an unqualified "id" inside the subquery would mean credential_records.id
      const credentialCount = sql<number>`(select count(*)::int from credential_records cr where cr.holder_id = "holders"."id")`;

      const [rows, totals] = await Promise.all([
        db
          .select({
            id: holders.id,
            externalRef: holders.externalRef,
            fullName: holders.fullName,
            recordType: holders.recordType,
            credentialCount,
            createdAt: holders.createdAt,
          })
          .from(holders)
          .where(where)
          .orderBy(
            ...(query.sort === 'name'
              ? [asc(holders.fullName), asc(holders.id)]
              : [desc(holders.createdAt), asc(holders.id)]),
          )
          .limit(query.limit)
          .offset(query.offset),
        db.select({ n: count() }).from(holders).where(where),
      ]);

      return {
        holders: rows.map((r) => ({
          ...r,
          credentialCount: Number(r.credentialCount),
          createdAt: r.createdAt.toISOString(),
        })),
        total: totals[0]?.n ?? 0,
        limit: query.limit,
        offset: query.offset,
      };
    },

    get: (staff, holderId) => loadDetail(staff.issuer.id, holderId),
  };
}
