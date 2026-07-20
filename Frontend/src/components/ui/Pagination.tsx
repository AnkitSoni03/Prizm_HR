import { Button } from './Button';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
}

export function Pagination({ total, limit, offset, onOffsetChange }: PaginationProps) {
  if (total <= limit) return null;

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-xs text-ink-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(offset - limit, 0))}
        >
          Previous
        </Button>
        <Button variant="secondary" disabled={offset + limit >= total} onClick={() => onOffsetChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}
