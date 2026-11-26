import { useId } from 'react';
import { Button } from './ui/button.js';
import { Select } from './ui/select.js';

export interface PaginationLabels {
  /** <nav> name, e.g. "Pages" */
  navigation: string;
  previous: string;
  next: string;
  /** e.g. "21–40 of 57" (the parent formats it in its language) */
  summary: string;
  /** e.g. "Rows per page" (only with pageSizeOptions) */
  pageSize?: string;
}

export interface PaginationProps {
  /** 1-based */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Offer a page-size choice (e.g. [10, 20, 50]) */
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
  labels: PaginationLabels;
}

/** Previous / next paging with a live summary, for server-side paged lists. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  labels,
}: PaginationProps) {
  const sizeId = useId();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label={labels.navigation}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p aria-live="polite" className="text-muted-foreground">
        {labels.summary}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {pageSizeOptions && onPageSizeChange ? (
          <span className="flex items-center gap-2">
            <label htmlFor={sizeId} className="text-muted-foreground">
              {labels.pageSize}
            </label>
            <Select
              id={sizeId}
              className="h-8 w-20"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {labels.previous}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          {labels.next}
        </Button>
      </div>
    </nav>
  );
}
