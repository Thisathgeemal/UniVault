import { ArrowDown, ArrowUp, ArrowUpDown } from './icons.js';
import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { Skeleton } from './ui/skeleton.js';

export type SortDirection = 'asc' | 'desc';
export interface DataTableSort {
  column: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  id: string;
  /** Column heading (already translated). */
  header: string;
  cell: (row: T) => ReactNode;
  /** Shows a sort button in the heading; the parent does the sorting (usually the server). */
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  /** The table's accessible name (rendered as a visually hidden caption). */
  caption: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /**
   * Mouse convenience: clicking anywhere in a row. Keyboard and screen-reader users need a
   * real link or button inside the row as well (e.g. the name cell links to the detail page).
   */
  onRowClick?: (row: T) => void;
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  /** Skeleton rows instead of data (the headings stay). */
  loading?: boolean;
  loadingRows?: number;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/**
 * A table with optional sortable headings (aria-sort) and clickable rows. Sorting and paging
 * are controlled by the parent, so it works with server-side paging (see Pagination).
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  onRowClick,
  sort,
  onSortChange,
  loading = false,
  loadingRows = 5,
}: DataTableProps<T>) {
  const nextSort = (column: string): DataTableSort => ({
    column,
    direction: sort?.column === column && sort.direction === 'asc' ? 'desc' : 'asc',
  });

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full text-left text-body-sm" aria-busy={loading}>
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-surface-sunken text-text-muted">
          <tr>
            {columns.map((column) => {
              const active = sort?.column === column.id ? sort.direction : undefined;
              const Icon = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ArrowUpDown;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={column.sortable ? (active ? ARIA_SORT[active] : 'none') : undefined}
                  className={cn('px-4 py-3 font-medium', column.className)}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      className="-ml-1 inline-flex min-h-10 items-center gap-1 rounded-sm px-1 text-label text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      onClick={() => onSortChange(nextSort(column.id))}
                    >
                      {column.header}
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading
            ? Array.from({ length: loadingRows }, (_, i) => (
                <tr key={`loading-${i}`} data-testid="data-table-loading-row">
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && 'cursor-pointer hover:bg-surface-sunken')}
                >
                  {columns.map((column) => (
                    <td key={column.id} className={cn('px-4 py-3', column.className)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
