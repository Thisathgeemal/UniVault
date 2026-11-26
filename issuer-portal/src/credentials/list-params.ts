/**
 * The credentials table's state in the URL (effectiveStatus, q, page, size, sort), so Back,
 * refresh and the dashboard's card links (/credentials?effectiveStatus=valid) keep it.
 */
import type { DataTableSort } from '@univault/portal-ui';
import {
  EFFECTIVE_STATUSES,
  LIST_SORTS,
  type CredentialListSort,
  type EffectiveStatus,
} from '../api/credentials.js';

export const PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT: CredentialListSort = 'newest';

export interface CredentialListState {
  status: EffectiveStatus | 'all';
  q: string;
  page: number;
  size: number;
  sort: CredentialListSort;
}

export function readCredentialListParams(params: URLSearchParams): CredentialListState {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const size = Number.parseInt(params.get('size') ?? '', 10);
  const sort = params.get('sort') as CredentialListSort | null;
  const status = params.get('effectiveStatus') as EffectiveStatus | null;
  return {
    status: status && EFFECTIVE_STATUSES.includes(status) ? status : 'all',
    q: (params.get('q') ?? '').trim(),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    sort: sort && LIST_SORTS.includes(sort) ? sort : DEFAULT_SORT,
  };
}

/** Back to the URL, leaving defaults out so plain /credentials stays plain. */
export function writeCredentialListParams(list: CredentialListState): URLSearchParams {
  const params = new URLSearchParams();
  if (list.status !== 'all') params.set('effectiveStatus', list.status);
  if (list.q) params.set('q', list.q);
  if (list.page !== 1) params.set('page', String(list.page));
  if (list.size !== DEFAULT_PAGE_SIZE) params.set('size', String(list.size));
  if (list.sort !== DEFAULT_SORT) params.set('sort', list.sort);
  return params;
}

/** Sortable columns <-> the backend's sort values ("Issued" sorts by creation time). */
export const SORT_OF: Record<string, Record<'asc' | 'desc', CredentialListSort>> = {
  holder: { asc: 'holder', desc: 'holder_desc' },
  issued: { asc: 'oldest', desc: 'newest' },
  expires: { asc: 'expires', desc: 'expires_desc' },
};

export function tableSortOf(sort: CredentialListSort): DataTableSort {
  for (const [column, directions] of Object.entries(SORT_OF)) {
    if (directions.asc === sort) return { column, direction: 'asc' };
    if (directions.desc === sort) return { column, direction: 'desc' };
  }
  return { column: 'issued', direction: 'desc' };
}

/** Whole days from `now` until `iso` (0 = later today), or null when past. */
export function daysUntil(iso: string, now: number): number | null {
  const ms = Date.parse(iso) - now;
  return ms <= 0 ? null : Math.floor(ms / 86_400_000);
}

/** The dashboard's "expiring soon" window. */
export const EXPIRING_SOON_DAYS = 30;

/** The first 8 characters of a credential id, as the table shows it (the full id is copied). */
export const shortId = (id: string) => id.slice(0, 8);
