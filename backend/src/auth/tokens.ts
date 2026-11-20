/**
 * Access tokens for issuer staff: short-lived JWTs (HS256, signed with JWT_SECRET).
 *
 * The token says who the staff member is and which issuer they belong to. It
 * is sent as "Authorization: Bearer <token>". Role and active status are
 * re-read from the database on every request (see middleware.ts), so
 * disabling a user or changing their role takes effect immediately.
 */
import { randomUUID } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';

export const TOKEN_ISSUER = 'univault-backend';
export const TOKEN_AUDIENCE = 'univault-issuer-portal';
const ALG = 'HS256';

export interface StaffTokenClaims {
  /** Staff member ID (JWT `sub`). */
  staffId: string;
  issuerId: string;
  role: 'admin' | 'officer';
}

export class TokenError extends Error {
  constructor(
    public readonly reason: 'expired' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'TokenError';
  }
}

export interface TokenService {
  issue(claims: StaffTokenClaims): Promise<{ token: string; expiresIn: number }>;
  verify(token: string): Promise<StaffTokenClaims>;
}

export function createTokenService(secret: string, expiresInSeconds: number): TokenService {
  const key = new TextEncoder().encode(secret);
  return {
    async issue(claims) {
      const token = await new SignJWT({ issuer_id: claims.issuerId, role: claims.role })
        .setProtectedHeader({ alg: ALG, typ: 'JWT' })
        .setSubject(claims.staffId)
        .setIssuer(TOKEN_ISSUER)
        .setAudience(TOKEN_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${expiresInSeconds}s`)
        .setJti(randomUUID())
        .sign(key);
      return { token, expiresIn: expiresInSeconds };
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALG], // rejects "none" and algorithm substitution
          issuer: TOKEN_ISSUER,
          audience: TOKEN_AUDIENCE,
          clockTolerance: 30,
        });
        const { sub, issuer_id: issuerId, role } = payload;
        if (
          typeof sub !== 'string' ||
          typeof issuerId !== 'string' ||
          (role !== 'admin' && role !== 'officer')
        ) {
          throw new TokenError('invalid', 'Token is missing required claims');
        }
        return { staffId: sub, issuerId, role };
      } catch (err) {
        if (err instanceof TokenError) throw err;
        if (err instanceof errors.JWTExpired) throw new TokenError('expired', 'Token has expired');
        throw new TokenError('invalid', 'Token is invalid');
      }
    },
  };
}
