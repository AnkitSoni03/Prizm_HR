import { useEffect, useState } from 'react';
import { Pencil, Plus, StopCircle, Users } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  endAssignment,
  formatRupees,
  listAssignments,
  orgLabel,
  periodLabel,
  type EmployeePayroll,
  type SalaryAssignment,
} from '../../../api/payroll';
import { ExtrasChips } from '../components/EmployeeExtras';
import { PayrollFilters, type PayrollFilterValue } from '../components/PayrollFilters';
import { AssignSalaryModal } from '../components/AssignSalaryModal';
import { BulkAssignSalaryModal } from '../components/BulkAssignSalaryModal';

const LIMIT = 50;

export function SalariesTab({ canManage }: { canManage: boolean }) {
  const [filters, setFilters] = useState<PayrollFilterValue>({ companyId: '', brandId: '', search: '' });
  const [status, setStatus] = useState('active');
  const [rows, setRows] = useState<SalaryAssignment[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SalaryAssignment | 'new' | null>(null);
  const [ending, setEnding] = useState<SalaryAssignment | null>(null);
  const [bulk, setBulk] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listAssignments({
        companyId: filters.companyId || undefined,
        brandId: filters.brandId || undefined,
        search: filters.search || undefined,
        status,
        limit: LIMIT,
        offset,
      });
      setRows(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load salaries.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, status, offset]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-44">
          <Select
            label="Show"
            value={status}
            onChange={(e) => {
              setOffset(0);
              setStatus(e.target.value);
            }}
            options={[
              { value: 'active', label: 'Current salaries' },
              { value: 'all', label: 'All, incl. history' },
            ]}
          />
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBulk(true)}>
              <Users className="mr-1.5 h-4 w-4" /> Bulk assign
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus className="mr-1.5 h-4 w-4" /> Assign salary
            </Button>
          </div>
        )}
      </div>
      <PayrollFilters
        value={filters}
        onChange={(v) => {
          setOffset(0);
          setFilters(v);
        }}
      />

      {error && <p className="text-sm text-danger">{error}</p>}
      <Table
        isLoading={isLoading}
        rows={rows}
        rowKey={(r) => String(r.id)}
        emptyMessage="No salaries assigned yet."
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
          { key: 'template', header: 'Template', render: (r) => r.template?.name ?? '—' },
          {
            key: 'ctc',
            header: 'CTC',
            render: (r) => (
              <div>
                <p className="text-ink">{formatRupees(r.monthlyCtc)} / month</p>
                {r.ctcPeriod === 'yearly' && <p className="text-xs text-ink-muted">{formatRupees(r.ctcAmount)} / year</p>}
              </div>
            ),
          },
          { key: 'from', header: 'Period', render: (r) => `${r.effectiveFrom} → ${r.effectiveTo ?? 'now'}` },
          { key: 'extras', header: 'Extras', render: (r) => <ExtrasChips extras={r.extras} /> },
          {
            key: 'ded',
            header: 'Deductions',
            render: (r) =>
              !r.deductionsEnabled ? (
                <Badge tone="neutral">Off (in-hand = CTC)</Badge>
              ) : r.disabledItems.length > 0 ? (
                <Badge tone="warning">{r.disabledItems.length} turned off</Badge>
              ) : (
                <Badge tone="success">As template</Badge>
              ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => (
              <Badge tone={r.status === 'active' ? 'success' : 'neutral'}>
                {r.status === 'active' ? 'Current' : r.status === 'ended' ? 'Ended' : 'Replaced'}
              </Badge>
            ),
          },
          ...(canManage
            ? [
              {
                key: 'actions',
                header: '',
                className: 'w-24 text-right',
                render: (r: SalaryAssignment) => (
                  <div className="flex justify-end gap-1">
                    <button type="button" title="Correct this salary" className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-primary" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    {r.status === 'active' && (
                      <button type="button" title="End salary" className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-danger" onClick={() => setEnding(r)}>
                        <StopCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ),
              },
            ]
            : []),
        ]}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {editing && (
        <AssignSalaryModal
          assignment={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {bulk && (
        <BulkAssignSalaryModal
          onClose={() => setBulk(false)}
          onSaved={() => {
            setBulk(false);
            load();
          }}
        />
      )}
      {ending && (
        <EndSalaryModal
          assignment={ending}
          onClose={() => setEnding(null)}
          onDone={() => {
            setEnding(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function EndSalaryModal({ assignment, onClose, onDone }: { assignment: SalaryAssignment; onClose: () => void; onDone: () => void }) {
  const showToast = useToast();
  const [endDate, setEndDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [final, setFinal] = useState<EmployeePayroll | null>(null);
  const today = todayStr();

  async function handleSave() {
    if (!endDate) return setError('Choose the last working day.');
    setIsSaving(true);
    setError(null);
    try {
      const result = await endAssignment(String(assignment.id), endDate);
      if (result.finalPayroll) {
        setFinal(result.finalPayroll);
      } else {
        showToast(
          endDate > today
            ? `Salary ends on ${endDate}. The final salary is made the day after.`
            : 'Salary ended. The months it touches are recalculated.',
          'success'
        );
        onDone();
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not end the salary.'));
    } finally {
      setIsSaving(false);
    }
  }

  if (final) {
    return (
      <Modal title="Final salary ready" onClose={onDone} compact>
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {assignment.employee?.name}&apos;s salary for {periodLabel(final.periodYear, final.periodMonth)}, up to {final.finalDate}:
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-border px-3 py-2">
              <p className="text-xs text-ink-muted">Paid / LOP days</p>
              <p className="font-semibold text-ink">{final.paidDays} / {final.lopDays}</p>
            </div>
            <div className="rounded-xl border border-border px-3 py-2">
              <p className="text-xs text-ink-muted">Gross</p>
              <p className="font-semibold text-ink">{formatRupees(final.grossEarned)}</p>
            </div>
            <div className="rounded-xl border border-border px-3 py-2">
              <p className="text-xs text-ink-muted">Deductions</p>
              <p className="font-semibold text-ink">{formatRupees(final.totalDeductions)}</p>
            </div>
            <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2">
              <p className="text-xs text-success">In-hand</p>
              <p className="font-semibold text-success">{formatRupees(final.netPay)}</p>
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            Full details, the payslip and Share are in Monthly Payroll → {periodLabel(final.periodYear, final.periodMonth)}. It is
            refreshed by itself if attendance or leave up to the last day changes.
          </p>
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="End salary" onClose={onClose} compact>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {assignment.employee?.name} is paid up to and including this date — by attendance, like any month. Days after it are not
          paid (and not counted as LOP). Later months are not generated.
        </p>
        <Input label="Last working day" type="date" value={endDate} min={assignment.effectiveFrom} onChange={(e) => setEndDate(e.target.value)} />
        {endDate && endDate <= today && (
          <p className="text-xs text-ink-muted">That month&apos;s final salary is made right away.</p>
        )}
        {endDate && endDate > today && (
          <p className="text-xs text-ink-muted">A future date — the final salary is made automatically the day after it.</p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleSave} isLoading={isSaving}>End salary</Button>
        </div>
      </div>
    </Modal>
  );
}
