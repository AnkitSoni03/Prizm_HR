import { useEffect, useState } from 'react';
import { Select } from '../../components/ui/Select';
import { Pagination } from '../../components/ui/Pagination';
import { RequestCardGrid } from '../../components/ui/RequestCard';
import { ResignationCard } from '../../components/ResignationCard';
import { listCompanyResignations, type Resignation } from '../../api/resignations';

const LIMIT = 21;

// Company Admin / Brand Admin view of resignations — read-only. Only the
// employee's assigned HR (set on the employee's profile) can accept/reject,
// from their own ESS Resignation page. Brand Admin sees only their Brand's
// (scoped server-side).
export function ResignationsPage() {
  const [rows, setRows] = useState<Resignation[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);
    listCompanyResignations({ status: statusFilter || undefined, limit: LIMIT, offset })
      .then((result) => {
        if (cancelled) return;
        setRows(result.data);
        setTotal(result.pagination.total);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load resignations.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, offset]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="w-full sm:w-48">
          <Select
            id="resignation-status"
            label="Status"
            value={statusFilter}
            onChange={(event) => {
              setOffset(0);
              setStatusFilter(event.target.value);
            }}
            placeholder="All statuses"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'withdrawn', label: 'Withdrawn' },
            ]}
          />
        </div>
        <p className="text-xs text-ink-muted">
          View only. The employee's assigned HR accepts or rejects. Set HR on the employee's profile.
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <RequestCardGrid
        isLoading={isLoading}
        items={rows}
        rowKey={(r) => r.id}
        emptyMessage="No resignations."
        renderCard={(r) => <ResignationCard resignation={r} showEmployee />}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
    </div>
  );
}
