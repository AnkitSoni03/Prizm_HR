import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { LEVEL_LABEL, listGroupEmployees, listScopeCompanies, type GroupEmployee, type ScopeCompany } from '../../../api/payroll';

const PAGE = 100;
const MAX_SELECT = 2000;

interface Props {
  selected: Map<string, GroupEmployee>;
  onChange: (next: Map<string, GroupEmployee>) => void;
  // Only this company / brand's employees (an item made for one company or
  // brand can't apply to anyone else).
  lockTo?: { companyId: string | null; brandId: string | null } | null;
  // Assigning salary: employees whose salary is owned above the caller's
  // level can't be picked (they need a release first).
  skipLocked?: boolean;
}

const nameOf = (e: GroupEmployee) => `${e.name ?? '—'}${e.employeeCode ? ` (${e.employeeCode})` : ''}`;
const orgOf = (e: GroupEmployee) => [e.company?.name, e.brand?.name].filter(Boolean).join(' › ');

// Bulk employee picker across the whole Group: Company › Brand › search
// filters (server-side), checkboxes, "select all matching" (every page, not
// just the visible one). The selection survives changing the filters, so
// people from several companies can be picked in one go.
export function EmployeeMultiPicker({ selected, onChange, lockTo = null, skipLocked = false }: Props) {
  const [companies, setCompanies] = useState<ScopeCompany[]>([]);
  const [pickedCompanyId, setCompanyId] = useState('');
  const [pickedBrandId, setBrandId] = useState('');
  const companyId = lockTo?.companyId ? String(lockTo.companyId) : pickedCompanyId;
  const brandId = lockTo?.brandId ? String(lockTo.brandId) : pickedBrandId;
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<GroupEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listScopeCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, []);

  const filter = { companyId: companyId || undefined, brandId: brandId || undefined, search: search.trim() || undefined };

  useEffect(() => {
    const handle = setTimeout(() => {
      setIsLoading(true);
      setError(null);
      listGroupEmployees({ ...filter, limit: PAGE, offset: 0 })
        .then((r) => {
          setRows(r.data);
          setTotal(r.pagination.total);
        })
        .catch(() => setError('Could not load employees.'))
        .finally(() => setIsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, brandId, search]);

  async function loadMore() {
    setIsLoading(true);
    try {
      const r = await listGroupEmployees({ ...filter, limit: PAGE, offset: rows.length });
      setRows([...rows, ...r.data]);
      setTotal(r.pagination.total);
    } catch {
      setError('Could not load more employees.');
    } finally {
      setIsLoading(false);
    }
  }

  const isBlocked = (e: GroupEmployee) => skipLocked && e.locked;

  function toggle(e: GroupEmployee) {
    if (isBlocked(e) && !selected.has(String(e.id))) return;
    const next = new Map(selected);
    if (next.has(String(e.id))) next.delete(String(e.id));
    else next.set(String(e.id), e);
    onChange(next);
  }

  async function selectAllMatching() {
    setIsSelectingAll(true);
    setError(null);
    try {
      const next = new Map(selected);
      let offset = 0;
      for (;;) {
        const r = await listGroupEmployees({ ...filter, limit: PAGE, offset });
        r.data.forEach((e) => {
          if (!isBlocked(e)) next.set(String(e.id), e);
        });
        offset += r.data.length;
        if (r.data.length === 0 || offset >= r.pagination.total || next.size >= MAX_SELECT) break;
      }
      if (next.size > MAX_SELECT) setError(`At most ${MAX_SELECT} employees can be picked at once.`);
      onChange(new Map([...next.entries()].slice(0, MAX_SELECT)));
    } catch {
      setError('Could not select every employee.');
    } finally {
      setIsSelectingAll(false);
    }
  }

  function clearMatching() {
    const next = new Map(selected);
    rows.forEach((e) => next.delete(String(e.id)));
    onChange(next);
  }

  const company = companies.length === 1 ? companies[0] : companies.find((c) => String(c.id) === companyId);
  const brands = company?.brands ?? [];
  const pickable = rows.filter((e) => !isBlocked(e));
  const allVisibleSelected = pickable.length > 0 && pickable.every((e) => selected.has(String(e.id)));
  const chips = [...selected.values()];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Employees</p>
        <span className="text-xs text-ink-muted">{selected.size} selected</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {companies.length > 1 && !lockTo?.companyId && (
          <Select
            label="Company"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setBrandId('');
            }}
            placeholder="All companies"
            options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        )}
        {brands.length > 0 && !lockTo?.brandId && (
          <Select
            label="Brand"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            placeholder="All brands"
            options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
          />
        )}
        <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code" />
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <button type="button" onClick={selectAllMatching} disabled={isSelectingAll || total === 0} className="font-medium text-primary hover:underline disabled:opacity-50">
          {isSelectingAll ? 'Selecting…' : `Select all ${total} matching`}
        </button>
        {allVisibleSelected && (
          <button type="button" onClick={clearMatching} className="font-medium text-ink-muted hover:underline">
            Unselect these
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={() => onChange(new Map())} className="font-medium text-danger hover:underline">
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-ink-muted">{isLoading ? 'Loading…' : 'No employees found.'}</p>
        ) : (
          rows.map((e) => {
            const hasSalary = (e.salaryAssignments ?? []).length > 0;
            const blocked = isBlocked(e);
            return (
              <label
                key={e.id}
                className={`flex items-center gap-2.5 border-b border-border px-3 py-2 text-sm text-ink last:border-b-0 ${
                  blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-page'
                }`}
                title={blocked ? 'Salary managed at a higher level — request a release in Employee Salaries' : undefined}
              >
                <input
                  type="checkbox"
                  checked={selected.has(String(e.id))}
                  disabled={blocked && !selected.has(String(e.id))}
                  onChange={() => toggle(e)}
                  className="h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{nameOf(e)}</span>
                  <span className="block truncate text-xs text-ink-muted">{orgOf(e)}</span>
                </span>
                {!hasSalary && <span className="shrink-0 text-xs text-warning">No current salary</span>}
                {blocked && e.ownerLevel && (
                  <span className="shrink-0 text-xs text-ink-muted">
                    {e.releaseRequested ? 'Release requested' : `Locked · ${LEVEL_LABEL[e.ownerLevel]}`}
                  </span>
                )}
              </label>
            );
          })
        )}
        {rows.length < total && (
          <button type="button" onClick={loadMore} disabled={isLoading} className="w-full px-3 py-2 text-sm font-medium text-primary hover:bg-page disabled:opacity-50">
            {isLoading ? 'Loading…' : `Show more (${total - rows.length} left)`}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.slice(0, 30).map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-xs text-primary">
              {nameOf(e)}
              <button type="button" aria-label={`Remove ${e.name ?? ''}`} onClick={() => toggle(e)} className="hover:text-danger">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {chips.length > 30 && <span className="text-xs text-ink-muted">+{chips.length - 30} more</span>}
        </div>
      )}
    </div>
  );
}
