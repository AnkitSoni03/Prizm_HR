import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Table } from '../../../components/ui/Table';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Toggle } from '../../../components/ui/Toggle';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import { apiErrorMessage } from '../../../utils/apiError';
import {
  createCustomItem,
  deleteCustomItem,
  listCustomItemEmployees,
  listCustomItems,
  updateCustomItem,
  monthKeyLabel,
  ownerLabel,
  type BuiltInItem,
  type PayrollAccess,
  type GroupEmployee,
  type PayrollCustomItem,
} from '../../../api/payroll';
import { MonthMultiPicker } from '../components/MonthMultiPicker';
import { EmployeeMultiPicker } from '../components/EmployeeMultiPicker';
import { OwnerLevelSelect, type OwnerChoice } from '../components/OwnerLevelSelect';

function describe(item: PayrollCustomItem) {
  if (item.calcType === 'fixed') return `₹${Number(item.value)} per month`;
  return `${Number(item.value)}% of ${item.basis === 'ctc' ? 'CTC' : item.basis === 'gross' ? 'Gross' : 'Basic'}`;
}

const KIND_LABEL: Record<PayrollCustomItem['kind'], string> = {
  earning: 'Allowance (earning)',
  deduction: 'Employee deduction',
  employer_contribution: 'Employer contribution',
};

// Extra allowances / deductions / employer contributions on top of the
// template. Each applies only to the employees chosen on it (and, if set,
// only in chosen months) — everyone else is paid by their template alone.
export function DeductionsTab({ access }: { access: PayrollAccess }) {
  const { canManage } = access;
  const confirm = useConfirm();
  const showToast = useToast();
  const [rows, setRows] = useState<PayrollCustomItem[]>([]);
  const [builtIn, setBuiltIn] = useState<BuiltInItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState<PayrollCustomItem | 'new' | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      const r = await listCustomItems();
      setRows(r.data);
      setBuiltIn(r.builtInItems);
    } catch {
      showToast('Could not load allowances and deductions.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete(item: PayrollCustomItem) {
    const ok = await confirm({
      title: `Delete ${item.kind === 'earning' ? 'allowance' : 'item'}`,
      message: `Delete "${item.name}"? It stops applying to its ${item.employeeCount ?? 0} employee(s) from the next generated month.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteCustomItem(String(item.id));
      load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete.'), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-page px-3 py-2 text-sm text-ink-muted">
        Built in (set the % in each template): {builtIn.map((b) => b.label).join(', ')}.
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Your own extra items — each one applies only to the employees you choose on it. Everyone else is paid by their salary
          template alone. An allowance is part of CTC and is taken out of the Special allowance, so in-hand stays the same. For a
          one-time bonus, use the Bonuses tab.
        </p>
        {canManage && (
          <Button onClick={() => setOpen('new')}>
            <Plus className="mr-1.5 h-4 w-4" /> Add item
          </Button>
        )}
      </div>
      <Table
        isLoading={isLoading}
        rows={rows}
        rowKey={(r) => String(r.id)}
        emptyMessage="No extra allowances or deductions added."
        columns={[
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-ink">{r.name}</span> },
          { key: 'owner', header: 'Made for', render: (r) => (r.ownerLevel ? <Badge tone="neutral">{ownerLabel(r)}</Badge> : '—') },
          {
            key: 'kind',
            header: 'Type',
            render: (r) => <Badge tone={r.kind === 'earning' ? 'success' : r.kind === 'deduction' ? 'danger' : 'warning'}>{KIND_LABEL[r.kind]}</Badge>,
          },
          { key: 'value', header: 'Amount', render: describe },
          {
            key: 'employees',
            header: 'Employees',
            render: (r) =>
              r.employeeCount ? (
                <span className="text-ink">{r.employeeCount}</span>
              ) : (
                <span className="text-ink-muted">None chosen</span>
              ),
          },
          {
            key: 'months',
            header: 'Applies in',
            render: (r) =>
              r.months && r.months.length > 0 ? (
                <span className="text-ink">{r.months.map(monthKeyLabel).join(', ')}</span>
              ) : (
                <span className="text-ink-muted">Every month</span>
              ),
          },
          { key: 'status', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Off'}</Badge> },
          ...(canManage
            ? [
              {
                key: 'actions',
                header: '',
                className: 'w-24 text-right',
                render: (r: PayrollCustomItem) =>
                  r.canEdit && (
                    <div className="flex justify-end gap-1">
                      <button type="button" title="Edit" className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-primary" onClick={() => setOpen(r)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" title="Delete" className="rounded-lg p-1.5 text-ink-muted hover:bg-page hover:text-danger" onClick={() => handleDelete(r)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ),
              },
            ]
            : []),
        ]}
      />

      {open && (
        <CustomItemFormModal
          item={open === 'new' ? null : open}
          access={access}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            showToast('Saved.', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}

function CustomItemFormModal({
  item,
  access,
  onClose,
  onSaved,
}: {
  item: PayrollCustomItem | null;
  access: PayrollAccess;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [owner, setOwner] = useState<OwnerChoice>({ companyId: null, brandId: null });
  const [kind, setKind] = useState<PayrollCustomItem['kind']>(item?.kind ?? 'deduction');
  const [calcType, setCalcType] = useState<PayrollCustomItem['calcType']>(item?.calcType ?? 'fixed');
  const [basis, setBasis] = useState<'basic' | 'gross' | 'ctc'>(item?.basis ?? 'gross');
  const [value, setValue] = useState(item ? String(Number(item.value)) : '');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [limited, setLimited] = useState(!!(item?.months && item.months.length > 0));
  const [months, setMonths] = useState<string[]>(item?.months ?? []);
  const [employees, setEmployees] = useState<Map<string, GroupEmployee>>(new Map());
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(!!item);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    listCustomItemEmployees(String(item.id))
      .then((list) => setEmployees(new Map(list.map((e) => [String(e.id), { ...e, salaryAssignments: [] } as GroupEmployee]))))
      .catch(() => setError('Could not load the employees of this item.'))
      .finally(() => setIsLoadingEmployees(false));
  }, [item]);

  async function handleSave() {
    if (employees.size === 0) return setError('Choose at least one employee.');
    if (limited && months.length === 0) return setError('Choose at least one month, or set it to every month.');
    setIsSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        kind,
        calcType,
        basis: calcType === 'percent' ? basis : null,
        value: Number(value),
        months: limited ? months : null,
        isActive,
        employeeIds: [...employees.keys()],
      };
      if (item) await updateCustomItem(String(item.id), body);
      else await createCustomItem({ ...body, ...owner });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={item ? 'Edit item' : 'Add allowance or deduction'} onClose={onClose} widthClassName="max-w-3xl">
      <div className="space-y-3">
        {item ? (
          item.ownerLevel && (
            <p className="text-sm text-ink-muted">
              Made for: <span className="font-medium text-ink">{ownerLabel(item)}</span>
            </p>
          )
        ) : (
          <OwnerLevelSelect
            access={access}
            value={owner}
            onChange={(v) => {
              setOwner(v);
              setEmployees(new Map());
            }}
          />
        )}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'earning' ? 'e.g. Conveyance, Medical allowance' : 'e.g. Canteen, Loan EMI'} />
        <Select
          label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value as PayrollCustomItem['kind'])}
          options={[
            { value: 'earning', label: 'Allowance (paid every month, part of CTC)' },
            { value: 'deduction', label: "Employee deduction (cut from the employee's pay)" },
            { value: 'employer_contribution', label: 'Employer contribution (paid by the company, inside CTC)' },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Amount is"
            value={calcType}
            onChange={(e) => setCalcType(e.target.value as PayrollCustomItem['calcType'])}
            options={[
              { value: 'fixed', label: 'Fixed ₹ per month' },
              { value: 'percent', label: 'A percentage' },
            ]}
          />
          {calcType === 'percent' && (
            <Select
              label="Percentage of"
              value={basis}
              onChange={(e) => setBasis(e.target.value as 'basic' | 'gross' | 'ctc')}
              options={[
                { value: 'basic', label: 'Basic' },
                { value: 'gross', label: 'Gross' },
                { value: 'ctc', label: 'CTC' },
              ]}
            />
          )}
        </div>
        <Input label={calcType === 'fixed' ? 'Amount (₹ per month)' : 'Percentage (%)'} type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />

        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Employees</p>
          <p className="text-xs text-ink-muted">
            Only these employees get it. Pick one, several, or use “select all” after filtering by company / brand.
          </p>
          {isLoadingEmployees ? <p className="text-sm text-ink-muted">Loading…</p> : <EmployeeMultiPicker selected={employees} onChange={setEmployees} lockTo={item ? { companyId: item.companyId ?? null, brandId: item.brandId ?? null } : owner} />}
        </div>

        <Select
          label="Applies in"
          value={limited ? 'some' : 'every'}
          onChange={(e) => setLimited(e.target.value === 'some')}
          options={[
            { value: 'every', label: 'Every month' },
            { value: 'some', label: 'Only the months I choose' },
          ]}
        />
        {limited ? (
          <MonthMultiPicker
            label="Months"
            value={months}
            onChange={setMonths}
            hint="Only these months’ salary changes — no other month. A chosen month that’s already generated is recalculated, and the difference is settled in the next salary."
          />
        ) : (
          <p className="text-xs text-ink-muted">Every month applies from the next payroll generated — months already generated stay as they are.</p>
        )}
        <Toggle checked={isActive} onChange={setIsActive} label="Active" />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} isLoading={isSaving}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
