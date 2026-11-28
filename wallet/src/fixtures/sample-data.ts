/**
 * SYNTHETIC sample credentials and history entries for the placeholder screens and the UI Kit,
 * shown in development builds only (sampleDataEnabled()). Invented people; issuers are the
 * "(Demo)" organisations of backend/seed-data. Not SD-JWTs and no keys: real credentials come
 * from the vault in a later task. One credential per backend status (plus the two wallet-only
 * states) so every badge can be seen.
 */
import {
  walletStatusFromBackend,
  type BackendStatus,
  type WalletStatus,
} from '../credentials/status';

export type CredentialTypeKey = 'EmploymentCredential' | 'KYCCredential';

export interface SampleCredential {
  id: string;
  issuerName: string;
  type: CredentialTypeKey;
  holderName: string;
  expiresAt: string;
  /** What GET /status would say; null = never checked (wallet-only states). */
  backendStatus: BackendStatus | null;
  /** Only for the wallet-only states. */
  walletStatus?: Extract<WalletStatus, 'notChecked' | 'checking'>;
}

export const SAMPLE_CREDENTIALS: readonly SampleCredential[] = [
  {
    id: 'sample-employment-active',
    issuerName: 'Serendib Trading Company (Demo)',
    type: 'EmploymentCredential',
    holderName: 'Sample Holder One',
    expiresAt: '2027-11-27T00:00:00Z',
    backendStatus: 'valid',
  },
  {
    id: 'sample-kyc-active',
    issuerName: 'UniVault Demo Bank',
    type: 'KYCCredential',
    holderName: 'Sample Holder One',
    expiresAt: '2028-03-15T00:00:00Z',
    backendStatus: 'valid',
  },
  {
    id: 'sample-employment-replaced',
    issuerName: 'Serendib Trading Company (Demo)',
    type: 'EmploymentCredential',
    holderName: 'Sample Holder One',
    expiresAt: '2027-06-01T00:00:00Z',
    backendStatus: 'superseded',
  },
  {
    id: 'sample-employment-revoked',
    issuerName: 'Lanka Agro Tools Enterprises (Demo)',
    type: 'EmploymentCredential',
    holderName: 'Sample Holder One',
    expiresAt: '2027-02-10T00:00:00Z',
    backendStatus: 'revoked',
  },
  {
    id: 'sample-kyc-expired',
    issuerName: 'UniVault Demo Bank',
    type: 'KYCCredential',
    holderName: 'Sample Holder One',
    expiresAt: '2025-10-01T00:00:00Z',
    backendStatus: 'expired',
  },
  {
    id: 'sample-kyc-not-checked',
    issuerName: 'UniVault Demo Bank',
    type: 'KYCCredential',
    holderName: 'Sample Holder One',
    expiresAt: '2028-01-20T00:00:00Z',
    backendStatus: null,
    walletStatus: 'notChecked',
  },
  {
    id: 'sample-employment-checking',
    issuerName: 'Serendib Trading Company (Demo)',
    type: 'EmploymentCredential',
    holderName: 'Sample Holder One',
    expiresAt: '2027-09-30T00:00:00Z',
    backendStatus: null,
    walletStatus: 'checking',
  },
];

export interface SampleHistoryEntry {
  id: string;
  kind: 'received' | 'shared';
  credentialId: string;
  party: string;
  at: string;
}

export const SAMPLE_HISTORY: readonly SampleHistoryEntry[] = [
  {
    id: 'sample-history-1',
    kind: 'shared',
    credentialId: 'sample-employment-active',
    party: 'Sample Verifier (Demo)',
    at: '2026-11-26T09:30:00Z',
  },
  {
    id: 'sample-history-2',
    kind: 'received',
    credentialId: 'sample-employment-active',
    party: 'Serendib Trading Company (Demo)',
    at: '2026-11-25T14:05:00Z',
  },
  {
    id: 'sample-history-3',
    kind: 'received',
    credentialId: 'sample-kyc-active',
    party: 'UniVault Demo Bank',
    at: '2026-11-20T08:00:00Z',
  },
];

export const findSampleCredential = (id: string) => SAMPLE_CREDENTIALS.find((c) => c.id === id);
export const findSampleHistoryEntry = (id: string) => SAMPLE_HISTORY.find((e) => e.id === id);

/** The state a sample shows: its wallet-only state, else mapped from the backend status. */
export const sampleStatus = (c: SampleCredential): WalletStatus =>
  c.walletStatus ?? walletStatusFromBackend(c.backendStatus);
