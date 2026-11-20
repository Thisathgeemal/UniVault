/**
 * Issuer signing keys: generation, rotation and public-key publication.
 *
 * - Private keys are created with @univault/crypto-core, encrypted with
 *   ISSUER_KEY_PASSPHRASE and written to ISSUER_KEYS_DIR (git-ignored).
 *   They never enter the database or an API response.
 * - Public keys go into the issuer_keys table and are published as a
 *   JSON Web Key Set (JWKS) at GET /api/v1/issuers/:issuerId/keys.
 * - Rotation retires the current key instead of deleting it: credentials
 *   signed with the old key must keep verifying until they expire.
 */
import { rm } from 'node:fs/promises';
import {
  generateIssuerKeys,
  issuerKeyFileNames,
  saveIssuerKeyPair,
  type IssuerPublicJwk,
} from '@univault/crypto-core/node';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { join } from 'node:path';
import type { Db } from '../db/client.js';
import { issuerKeys, issuers } from '../db/schema.js';
import { AppError } from '../lib/errors.js';

/** Only these members are ever published (RFC 7517) – never private key material. */
const PUBLIC_JWK_MEMBERS = ['kty', 'kid', 'use', 'alg', 'n', 'e'] as const;

export interface PublicJwks {
  keys: IssuerPublicJwk[];
}

export interface GeneratedKeyInfo {
  issuerId: string;
  kid: string;
  alg: 'RS256';
  createdAt: string;
  /** The previously active key, now retired (if there was one). */
  retiredKid: string | null;
}

export interface IssuerSummary {
  id: string;
  name: string;
  type: 'employer' | 'bank';
  jwksUri: string;
}

export interface IssuerKeysService {
  listIssuers(): Promise<IssuerSummary[]>;
  getPublicJwks(issuerId: string): Promise<PublicJwks>;
  generateKey(issuerId: string): Promise<GeneratedKeyInfo>;
  /** Issuers that have no active signing key yet. */
  issuersWithoutActiveKey(): Promise<string[]>;
}

export function issuerNotFound(issuerId: string): AppError {
  return new AppError(404, 'ISSUER_NOT_FOUND', `Issuer "${issuerId}" does not exist`);
}

export function toPublicJwk(stored: Record<string, unknown>): IssuerPublicJwk {
  const jwk = Object.fromEntries(
    PUBLIC_JWK_MEMBERS.filter((m) => stored[m] !== undefined).map((m) => [m, stored[m]]),
  );
  return jwk as unknown as IssuerPublicJwk;
}

export function createIssuerKeysService(
  db: Db,
  options: { keysDir: string; passphrase: string | undefined; publicBaseUrl: string },
): IssuerKeysService {
  const issuerExists = async (issuerId: string) =>
    (await db.select({ id: issuers.id }).from(issuers).where(eq(issuers.id, issuerId))).length > 0;

  return {
    async listIssuers() {
      const rows = await db.select().from(issuers).orderBy(asc(issuers.id));
      return rows.map((i) => ({
        id: i.id,
        name: i.name,
        type: i.issuerType,
        jwksUri: `${options.publicBaseUrl.replace(/\/$/, '')}/api/v1/issuers/${i.id}/keys`,
      }));
    },

    async getPublicJwks(issuerId) {
      if (!(await issuerExists(issuerId))) throw issuerNotFound(issuerId);
      // Active key first, then retired keys newest first (still needed for older credentials)
      const rows = await db
        .select()
        .from(issuerKeys)
        .where(eq(issuerKeys.issuerId, issuerId))
        .orderBy(
          sql`case when ${issuerKeys.status} = 'active' then 0 else 1 end`,
          desc(issuerKeys.createdAt),
        );
      if (rows.length === 0) {
        throw new AppError(
          404,
          'ISSUER_KEYS_NOT_FOUND',
          `Issuer "${issuerId}" has not published a signing key yet`,
        );
      }
      return { keys: rows.map((r) => toPublicJwk(r.publicJwk)) };
    },

    async generateKey(issuerId) {
      if (!(await issuerExists(issuerId))) throw issuerNotFound(issuerId);
      if (!options.passphrase) {
        throw new AppError(
          503,
          'KEY_PASSPHRASE_NOT_CONFIGURED',
          'ISSUER_KEY_PASSPHRASE must be set in backend/.env before issuer keys can be generated',
        );
      }

      // 1. Create the key pair and store the encrypted private key on disk
      const keyPair = await generateIssuerKeys({ passphrase: options.passphrase });
      await saveIssuerKeyPair(options.keysDir, keyPair);

      // 2. Retire the current key and publish the new one – in one transaction,
      //    so there is never a moment with zero or two active keys
      try {
        const retiredKid = await db.transaction(async (tx) => {
          const retired = await tx
            .update(issuerKeys)
            .set({ status: 'retired', retiredAt: new Date() })
            .where(and(eq(issuerKeys.issuerId, issuerId), eq(issuerKeys.status, 'active')))
            .returning({ kid: issuerKeys.kid });
          await tx.insert(issuerKeys).values({
            kid: keyPair.kid,
            issuerId,
            alg: 'RS256',
            publicJwk: { ...keyPair.publicJwk },
            status: 'active',
          });
          return retired[0]?.kid ?? null;
        });
        return {
          issuerId,
          kid: keyPair.kid,
          alg: 'RS256',
          createdAt: keyPair.createdAt,
          retiredKid,
        };
      } catch (err) {
        // Do not leave an unpublished private key on disk
        const names = issuerKeyFileNames(keyPair.kid);
        await Promise.all([
          rm(join(options.keysDir, names.privateKey), { force: true }),
          rm(join(options.keysDir, names.publicJwk), { force: true }),
        ]);
        throw err;
      }
    },

    async issuersWithoutActiveKey() {
      const rows = (await db.execute(sql`
        select i.id from issuers i
        where not exists (select 1 from issuer_keys k where k.issuer_id = i.id and k.status = 'active')
        order by i.id
      `)) as unknown as { rows: { id: string }[] };
      return rows.rows.map((r) => r.id);
    },
  };
}
