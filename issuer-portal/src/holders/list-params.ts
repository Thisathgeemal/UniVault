/**
 * The holder list's state in the URL (q, page, size, sort), so Back and refresh keep it, and
 * the mapping between the table's sortable columns and the backend's sort values.
 */
import type { DataTableSort } from '@univault/portal-ui';
import { HOLDER_SORTS, type HolderSort } from '../api/holders.js';

export const PAGE_SIZES = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SORT: HolderSort = 'newest';

export interface ListParams {
  q: string;
  page: number;
  size: number;
  sort: HolderSort;
}

/** The list state from the URL; anything invalid falls back to the default. */
export function readListParams(params: URLSearchParams): ListParams {
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const size = Number.parseInt(params.get('size') ?? '', 10);
  const sort = params.get('sort') as HolderSort | null;
  return {
    q: (params.get('q') ?? '').trim(),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    sort: sort && HOLDER_SORTS.includes(sort) ? sort : DEFAULT_SORT,
  };
}

/** Back to the URL, leaving defaults out so plain /holders stays plain. */
export function writeListParams(list: ListParams): URLSearchParams {
  const params = new URLSearchParams();
  if (list.q) params.set('q', list.q);
  if (list.page !== 1) params.set('page', String(list.page));
  if (list.size !== DEFAULT_PAGE_SIZE) params.set('size', String(list.size));
  if (list.sort !== DEFAULT_SORT) params.set('sort', list.sort);
  return params;
}

/** Sortable columns <-> the backend's sort values. */
export const SORT_OF: Record<string, Record<'asc' | 'desc', HolderSort>> = {
  name: { asc: 'name', desc: 'name_desc' },
  reference: { asc: 'ref', desc: 'ref_desc' },
  createdAt: { asc: 'oldest', desc: 'newest' },
};

export function tableSortOf(sort: HolderSort): DataTableSort {
  for (const [column, directions] of Object.entries(SORT_OF)) {
    if (directions.asc === sort) return { column, direction: 'asc' };
    if (directions.desc === sort) return { column, direction: 'desc' };
  }
  return { column: 'createdAt', direction: 'desc' };
}
