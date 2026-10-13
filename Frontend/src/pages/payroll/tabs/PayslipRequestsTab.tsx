import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Badge } from '../../../components/ui/Badge';
import { RejectReasonModal } from '../../../components/RejectReasonModal';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import { decidePayslipRequest, listPayslipRequests, orgLabel, periodLabel, type PayslipRequest } from '../../../api/payroll';

const LIMIT = 50;
const TONE = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'neutral' } as const;

export function PayslipRequestsTab() {
  const showToast = useToast();
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<PayslipRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [rejecting, setRejecting] = useState<PayslipRequest | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      const result = await listPayslipRequests({ status, limit: LIMIT, offset });
      setRows(result.data);
      setTotal(result.pagination.total);
    } catch {
      showToast('Could not load payslip requests.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, offset]);

  async function approve(request: PayslipRequest) {
    try {
      await decidePayslipRequest(String(request.id), 'approved');
      showToast('Approved — the payslip is now on the employee’s dashboard.', 'success');
      load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not approve.'), 'error');
    }
  }

  return (
    <div className="space-y-3">
      <div className="w-44">
        <Select
          label="Status"
          value={status}
          onChange={(e) => {
            setOffset(0);
            setStatus(e.target.value);
          }}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      <Table
        isLoading={isLoading}
        rows={rows}
        rowKey={(r) => String(r.id)}
        emptyMessage="No payslip requests."
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            render: (r) => (
              <div>
                <p className="font-medium text-ink">
                  {r.employee?.name ?? '—'} {r.employee?.employeeCode ? `(${r.employee.employeeCode})` : ''}
                </p>
                <p className="text-xs text-ink-muted">{orgLabel(r.employee)}</p>
              </div>
            ),
          },
          { key: 'months', header: 'Months', render: (r) => r.periods.map((p) => periodLabel(p.year, p.month)).join(', ') },
          { key: 'note', header: 'Note', render: (r) => r.note ?? '—' },
          { key: 'on', header: 'Requested', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
          {
            key: 'status',
            header: 'Status',
            render: (r) => (
              <Badge tone={TONE[r.status]} title={r.rejectionReason ?? undefined}>
                {r.status}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            className: 'w-24 text-right',
            render: (r) =>
              r.status === 'pending' ? (
                <div className="flex justify-end gap-1">
                  <button type="button" title="Approve" className="rounded-lg p-1.5 text-success hover:bg-success/10" onClick={() => approve(r)}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" title="Reject" className="rounded-lg p-1.5 text-danger hover:bg-danger/10" onClick={() => setRejecting(r)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null,
          },
        ]}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {rejecting && (
        <RejectReasonModal
          title="Reject payslip request"
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await decidePayslipRequest(String(rejecting.id), 'rejected', reason);
            setRejecting(null);
            load();
          }}
        />
      )}
    </div>
  );
}
