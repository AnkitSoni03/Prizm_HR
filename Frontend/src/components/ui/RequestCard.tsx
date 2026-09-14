import type { ComponentType, ReactNode } from 'react';
import { Skeleton } from './Skeleton';

// Shared "my requests" card shell — used anywhere an employee reviews a list
// of their own leave/OD/comp-off style records. Replaces the old dense
// <Table> layout for these self-service lists, which read poorly as a wall
// of spreadsheet rows for something as personal as "did my leave get
// approved?". Admin approval queues (ApprovalsPage/TeamApprovalsPage) keep
// the table — those need row density across many employees, not this.
interface RequestCardProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClassName?: string;
  title: ReactNode;
  status: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function RequestCard({ icon: Icon, iconClassName, title, status, footer, children }: RequestCardProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-xs transition-shadow duration-150 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              iconClassName ?? 'bg-primary-light text-primary',
            ].join(' ')}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
          </span>
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
        </div>
        <div className="shrink-0">{status}</div>
      </div>

      <div className="mt-3.5 flex-1 space-y-2">{children}</div>

      {footer && <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-border pt-3">{footer}</div>}
    </div>
  );
}

export function RequestCardRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 pt-px text-xs text-ink-muted">{label}</span>
      <span className="text-right text-sm text-ink">{value}</span>
    </div>
  );
}

interface RequestCardGridProps<T> {
  items: T[];
  rowKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
  skeletonCount?: number;
}

export function RequestCardGrid<T>({
  items,
  rowKey,
  renderCard,
  isLoading,
  emptyMessage = 'No records found.',
  skeletonCount = 6,
}: RequestCardGridProps<T>) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-xl" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-ink-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {items.map((item) => (
        <div key={rowKey(item)}>{renderCard(item)}</div>
      ))}
    </div>
  );
}
