/**
 * Credential status in the wallet: the ONE mapping from the backend's effective status
 * (GET /status/:credentialId, `effectiveStatus()` in backend/src/services/credential-status.ts)
 * to what the wallet shows, plus the two wallet-only states. Each state uses one of the design
 * system's four status colour sets, with its own icon and its own word.
 *
 * | Backend effective status | Wallet state | Colour set | Icon (Ionicons)     | English         |
 * | ------------------------ | ------------ | ---------- | ------------------- | --------------- |
 * | valid                    | valid        | valid      | checkmark-circle    | Valid           |
 * | expired                  | expired      | expired    | time (clock)        | Expired         |
 * | revoked                  | revoked      | revoked    | ban                 | Revoked         |
 * | superseded               | replaced     | pending    | swap-horizontal     | Replaced        |
 * | – (stale / offline)      | notChecked   | expired    | cloud-offline       | Not checked yet |
 * | – (request running)      | checking     | pending    | sync (refresh)      | Checking…       |
 *
 * Design rules: a stale or offline status uses the expired colours; verification failures and
 * anomalies (later) use the revoked colours. `pending` never reaches a wallet (an unsigned
 * credential has no public status: 404), so an unknown value is shown as notChecked.
 */
import type { StatusSet } from '@univault/portal-ui/tokens';
import type { IconName } from '../components/Icon';

export const BACKEND_STATUSES = ['valid', 'revoked', 'superseded', 'expired'] as const;
export type BackendStatus = (typeof BACKEND_STATUSES)[number];

export const WALLET_STATUSES = [
  'valid',
  'expired',
  'revoked',
  'replaced',
  'notChecked',
  'checking',
] as const;
export type WalletStatus = (typeof WALLET_STATUSES)[number];

const FROM_BACKEND: Record<BackendStatus, WalletStatus> = {
  valid: 'valid',
  revoked: 'revoked',
  superseded: 'replaced',
  expired: 'expired',
};

const isBackendStatus = (value: unknown): value is BackendStatus =>
  typeof value === 'string' && (BACKEND_STATUSES as readonly string[]).includes(value);

/** Backend effective status → wallet state (anything else → notChecked). */
export function walletStatusFromBackend(status: unknown): WalletStatus {
  return isBackendStatus(status) ? FROM_BACKEND[status] : 'notChecked';
}

/** Colour set and icon of each state: every state has its own icon AND its own word. */
export const STATUS_PRESENTATION: Record<WalletStatus, { set: StatusSet; icon: IconName }> = {
  valid: { set: 'valid', icon: 'checkmark-circle' },
  expired: { set: 'expired', icon: 'time' },
  revoked: { set: 'revoked', icon: 'ban' },
  replaced: { set: 'pending', icon: 'swap-horizontal' },
  notChecked: { set: 'expired', icon: 'cloud-offline' },
  checking: { set: 'pending', icon: 'sync' },
};
