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
import { endAssignment, formatRupees, listAssignments, orgLabel, type SalaryAssignment } from '../../../api/payroll';
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

function EndSalaryModal({ assignment, onClose, onDone }: { assignment: SalaryAssignment; onClose: () => void; onDone: () => void }) {
  const showToast = useToast();
  const [endDate, setEndDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!endDate) return setError('Choose the last salary date.');
    setIsSaving(true);
    setError(null);
    try {
      await endAssignment(String(assignment.id), endDate);
      showToast('Salary ended.', 'success');
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not end the salary.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="End salary" onClose={onClose} compact>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {assignment.employee?.name} is paid up to and including this date. Later months are not generated.
        </p>
        <Input label="Last salary date" type="date" value={endDate} min={assignment.effectiveFrom} onChange={(e) => setEndDate(e.target.value)} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={handleSave} isLoading={isSaving}>End salary</Button>
        </div>
      </div>
    </Modal>
  );
}
