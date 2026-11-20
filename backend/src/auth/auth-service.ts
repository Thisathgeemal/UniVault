/**
 * Issuer staff login.
 *
 * Security measures:
 * - Same error ("Invalid email or password") for an unknown email, a wrong
 *   password or a disabled account, and a password hash is always checked,
 *   so the response does not reveal which accounts exist.
 * - After LOGIN_MAX_FAILED_ATTEMPTS consecutive failures the account is
 *   locked for LOGIN_LOCKOUT_MINUTES (stored in the database).
 * - Successful login resets the failure count and records last_login_at.
 */
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { issuers, issuerStaff } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import type { TokenService } from './tokens.js';

export interface StaffProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'officer';
  issuer: { id: string; name: string; type: 'employer' | 'bank' };
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  staff: StaffProfile;
}

export interface AuthService {
  login(email: string, password: string): Promise<LoginResult>;
  /** Loads an active staff member for an authenticated request, or null. */
  findActiveStaff(staffId: string): Promise<StaffProfile | null>;
}

export const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

export function createAuthService(
  db: Db,
  tokens: TokenService,
  options: { maxFailedAttempts: number; lockoutMinutes: number },
): AuthService {
  // Compared against when the email is unknown, so timing does not reveal account existence
  const dummyHash = hashPassword('dummy-password-for-timing');

  const loadProfile = async (staffId: string) => {
    const [row] = await db
      .select({
        id: issuerStaff.id,
        email: issuerStaff.email,
        displayName: issuerStaff.displayName,
        role: issuerStaff.role,
        isActive: issuerStaff.isActive,
        issuerId: issuers.id,
        issuerName: issuers.name,
        issuerType: issuers.issuerType,
      })
      .from(issuerStaff)
      .innerJoin(issuers, eq(issuers.id, issuerStaff.issuerId))
      .where(eq(issuerStaff.id, staffId));
    return row;
  };

  const toProfile = (row: NonNullable<Awaited<ReturnType<typeof loadProfile>>>): StaffProfile => ({
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    issuer: { id: row.issuerId, name: row.issuerName, type: row.issuerType },
  });

  return {
    async login(email, password) {
      const [staff] = await db
        .select()
        .from(issuerStaff)
        .where(sql`lower(${issuerStaff.email}) = lower(${email.trim()})`);

      if (!staff) {
        await verifyPassword(password, await dummyHash);
        throw invalidCredentials();
      }
      if (staff.lockedUntil && staff.lockedUntil.getTime() > Date.now()) {
        throw new AppError(
          423,
          'ACCOUNT_LOCKED',
          'Too many failed login attempts. Try again later.',
          { lockedUntil: staff.lockedUntil.toISOString() },
        );
      }

      const passwordOk = await verifyPassword(password, staff.passwordHash);
      if (!passwordOk || !staff.isActive) {
        if (!passwordOk) {
          // Count the failure; lock the account when the limit is reached
          const failures = staff.failedLoginAttempts + 1;
          const lock = failures >= options.maxFailedAttempts;
          await db
            .update(issuerStaff)
            .set({
              failedLoginAttempts: lock ? 0 : failures,
              lockedUntil: lock ? new Date(Date.now() + options.lockoutMinutes * 60_000) : null,
            })
            .where(eq(issuerStaff.id, staff.id));
        }
        throw invalidCredentials();
      }

      await db
        .update(issuerStaff)
        .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(issuerStaff.id, staff.id));

      const { token, expiresIn } = await tokens.issue({
        staffId: staff.id,
        issuerId: staff.issuerId,
        role: staff.role,
      });
      const row = await loadProfile(staff.id);
      if (!row) throw invalidCredentials();
      return { accessToken: token, tokenType: 'Bearer', expiresIn, staff: toProfile(row) };
    },

    async findActiveStaff(staffId) {
      const row = await loadProfile(staffId);
      return row && row.isActive ? toProfile(row) : null;
    },
  };
}
