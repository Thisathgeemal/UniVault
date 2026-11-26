/**
 * WHICH ACTIONS A CREDENTIAL OFFERS, for whom – the ONE rule used by the credentials table,
 * the credential page and the tests (docs/frontend/issuer-portal.md §12, Decision 012).
 *
 *   effective status   Revoke                  Reissue / Renew          Wallet offer
 *   valid (Active)     admin (officer: shown   Reissue: officer, admin  –
 *                      disabled, "Only
 *                      administrators…")
 *   pending            admin (same)            –                        Create / Show
 *   expired            admin (same)            Renew: officer, admin    –
 *   revoked            –                       –                        –
 *   superseded         –                       –                        –
 *
 * The backend enforces the same (revoke: admin only, pending/valid/expired; reissue: valid or
 * expired, never pending). The UI rule is a convenience; a refused request is still handled.
 */
import type { Role } from '../api/auth.js';
import type { EffectiveStatus } from '../api/credentials.js';

export interface ActionState {
  /** Shown at all. */
  visible: boolean;
  /** Usable by this role; when false, `disabledReason` says why. */
  enabled: boolean;
  disabledReason?: 'adminOnly';
}

export interface CredentialActions {
  revoke: ActionState;
  /** 'renew' for an expired credential (the same backend reissue). */
  reissue: ActionState & { kind: 'reissue' | 'renew' };
  /** 'show' when a usable offer exists (the offer screen then explains it can't be re-shown). */
  offer: ActionState & { kind: 'create' | 'show' };
}

const HIDDEN: ActionState = { visible: false, enabled: false };

export function credentialActions(
  credential: { effectiveStatus: EffectiveStatus; hasActiveOffer?: boolean },
  role: Role | undefined,
): CredentialActions {
  const status = credential.effectiveStatus;
  const isAdmin = role === 'admin';
  const isStaff = role === 'admin' || role === 'officer';
  const revocable = status === 'valid' || status === 'pending' || status === 'expired';
  const revoke: ActionState = !revocable
    ? HIDDEN
    : isAdmin
      ? { visible: true, enabled: true }
      : { visible: isStaff, enabled: false, disabledReason: 'adminOnly' };
  const reissuable = status === 'valid' || status === 'expired';
  return {
    revoke,
    reissue: {
      ...(reissuable && isStaff ? { visible: true, enabled: true } : HIDDEN),
      kind: status === 'expired' ? 'renew' : 'reissue',
    },
    offer: {
      ...(status === 'pending' && isStaff ? { visible: true, enabled: true } : HIDDEN),
      kind: credential.hasActiveOffer ? 'show' : 'create',
    },
  };
}
