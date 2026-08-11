import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  // Opt-in: keep the same table layout on mobile (horizontally scrollable)
  // instead of the default stacked-card view. Off by default so every
  // existing caller of this shared component is unaffected.
  scrollOnMobile?: boolean;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = 'No records found.',
  isLoading,
  scrollOnMobile,
}: TableProps<T>) {
  if (scrollOnMobile) {
    return (
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-page">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-ink-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!isLoading &&
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition-colors duration-150 hover:bg-page/60">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={['whitespace-nowrap px-4 py-2.5 align-middle text-ink', column.className]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-xs md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-page">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-ink-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!isLoading &&
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition-colors duration-150 hover:bg-page/60">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={['px-4 py-2.5 align-middle text-ink', column.className]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="mb-2 h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        {!isLoading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-ink-muted">
            {emptyMessage}
          </div>
        )}
        {!isLoading &&
          rows.map((row) => (
            <div key={rowKey(row)} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              {columns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {column.header}
                  </span>
                  <span className="text-right text-sm text-ink">{column.render(row)}</span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
