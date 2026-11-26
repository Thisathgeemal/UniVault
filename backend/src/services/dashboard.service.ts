/**
 * Issuer dashboard summary (GET /api/v1/dashboard/summary, docs/api/dashboard-api.md).
 *
 * Counts for the logged-in staff member's OWN issuer, plus its ten most recent status changes.
 * The issuer always comes from the token (req.auth); there is no issuer id in the request.
 *
 * Definitions ("issued" = signed: issued_at IS NOT NULL, set only by signCredential()):
 *   issued         signed credentials
 *   active         issued AND effective status 'valid'  (not revoked/superseded, now < expires_at)
 *   revoked        issued AND status 'revoked'
 *   superseded     issued AND status 'superseded'
 *   expired        issued AND effective status 'expired' (stored 'valid', expires_at <= now)
 *   awaitingWallet status 'pending'
 *   expiringSoon   active AND expires_at < now + expiringSoonDays
 *   holders        holder records of this issuer
 * A credential revoked while pending was never signed: it is in none of the issued counts.
 * Invariant: issued = active + revoked + superseded + expired.
 *
 * All counts come from ONE aggregate query with the injected clock's `now`, and the expiry
 * rule is effectiveStatusCondition() from credential-status.ts, the SQL twin of
 * effectiveStatus() also used by GET /credentials?effectiveStatus=â€¦, so they cannot disagree.
 */
import { and, count, desc, eq, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import type { StaffProfile } from '../auth/auth-service.js';
import type { Db } from '../db/client.js';
import { credentialRecords, credentialStatusEvents, holders, issuerStaff } from '../db/schema.js';
import { effectiveStatusCondition, type CredentialStatus } from './credential-status.js';
import { EVENT_ORDER } from './credentials.service.js';
import type { CredentialTypeName } from './credential-schemas.js';

export const EXPIRING_SOON_DAYS = 30;
export const RECENT_ACTIVITY_LIMIT = 10;
const DAY_MS = 86_400_000;

export interface DashboardCounts {
  issued: number;
  active: number;
  revoked: number;
  superseded: number;
  expired: number;
  awaitingWallet: number;
  expiringSoon: number;
  holders: number;
}

/** One status change. Reason codes only: never the note, never holder claims or names. */
export interface DashboardActivity {
  credentialId: string;
  credentialType: CredentialTypeName;
  fromStatus: CredentialStatus | null;
  toStatus: CredentialStatus;
  reason: string | null;
  /** Null for wallet-driven events (signing at redemption). */
  staffName: string | null;
  at: string;
}

export interface DashboardSummary {
  issuer: { id: string; name: string };
  counts: DashboardCounts;
  expiringSoonDays: number;
  recentActivity: DashboardActivity[];
  generatedAt: string;
}

export interface DashboardService {
  summary(staff: StaffProfile): Promise<DashboardSummary>;
}

/** COUNT(*) FILTER (WHERE â€¦) as an integer (PostgreSQL returns bigint for count). */
const countWhere = (condition: SQL) => sql<number>`(count(*) filter (where ${condition}))::int`;

/** `now` is the app's injected clock (createApp passes it), so tests can set the time. */
export function createDashboardService(db: Db, options: { now: () => Date }): DashboardService {
  const clock = options.now;

  return {
    async summary(staff) {
      const now = clock();
      const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
      const issuerId = staff.issuer.id;
      const issued = isNotNull(credentialRecords.issuedAt);
      const active = and(issued, effectiveStatusCondition('valid', now))!;

      // ONE aggregate query: every credential count plus the holder count (scalar subquery),
      // all scoped to this issuer (uses credential_records_issuer_status_idx)
      const holderCount = db
        .select({ n: count() })
        .from(holders)
        .where(eq(holders.issuerId, issuerId));
      // An aggregate without GROUP BY always returns exactly one row (zeros for no credentials)
      const [row] = await db
        .select({
          issued: countWhere(issued),
          active: countWhere(active),
          revoked: countWhere(and(issued, effectiveStatusCondition('revoked', now))!),
          superseded: countWhere(and(issued, effectiveStatusCondition('superseded', now))!),
          expired: countWhere(and(issued, effectiveStatusCondition('expired', now))!),
          awaitingWallet: countWhere(effectiveStatusCondition('pending', now)),
          expiringSoon: countWhere(and(active, lt(credentialRecords.expiresAt, soon))!),
          holders: sql<number>`(${holderCount})::int`,
        })
        .from(credentialRecords)
        .where(eq(credentialRecords.issuerId, issuerId));

      // Most recent status changes of this issuer's credentials. Reason codes only (no note);
      // the staff name comes from issuer_staff, null for wallet events
      const activity = await db
        .select({
          credentialId: credentialStatusEvents.credentialId,
          credentialType: credentialRecords.credentialType,
          fromStatus: credentialStatusEvents.fromStatus,
          toStatus: credentialStatusEvents.toStatus,
          reason: credentialStatusEvents.reason,
          staffName: issuerStaff.displayName,
          at: credentialStatusEvents.createdAt,
        })
        .from(credentialStatusEvents)
        .innerJoin(
          credentialRecords,
          and(
            eq(credentialRecords.id, credentialStatusEvents.credentialId),
            eq(credentialRecords.issuerId, issuerId),
          ),
        )
        .leftJoin(issuerStaff, eq(issuerStaff.id, credentialStatusEvents.staffId))
        .where(eq(credentialStatusEvents.issuerId, issuerId))
        // Newest first; events of the same instant in reverse lifecycle order (sign after create)
        .orderBy(
          desc(credentialStatusEvents.createdAt),
          desc(EVENT_ORDER),
          desc(credentialStatusEvents.id),
        )
        .limit(RECENT_ACTIVITY_LIMIT);

      return {
        issuer: { id: issuerId, name: staff.issuer.name },
        counts: { ...row! },
        expiringSoonDays: EXPIRING_SOON_DAYS,
        recentActivity: activity.map((a) => ({
          credentialId: a.credentialId,
          credentialType: a.credentialType,
          fromStatus: a.fromStatus,
          toStatus: a.toStatus,
          reason: a.reason,
          staffName: a.staffName,
          at: a.at.toISOString(),
        })),
        generatedAt: now.toISOString(),
      };
    },
  };
}
