import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { listEmployees } from '../../api/companyAdmin/employees';
import { listCompanies, type Company, type Employee } from '../../api/tenancy';

// Multi-employee picker for Employee Reports. Uses the normal employee list
// (employee:read), so each admin only ever sees their own scope: Company
// Admin / HR their company, Brand Admin their Brand (server-side), Group
// Admin one company of their Group at a time (company picker) — the
// selection is kept while switching companies, so several can be combined.

const PAGE = 100;
export const MAX_REPORT_EMPLOYEES = 500;

export interface PickedEmployee {
  id: string;
  name: string | null;
  employeeCode: string | null;
}

interface Props {
  isGroupAdmin: boolean;
  selected: Map<string, PickedEmployee>;
  onChange: (next: Map<string, PickedEmployee>) => void;
}

const label = (e: PickedEmployee) => `${e.name ?? '—'}${e.employeeCode ? ` (${e.employeeCode})` : ''}`;

export function ReportEmployeePicker({ isGroupAdmin, selected, onChange }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGroupAdmin) return;
    listCompanies()
      .then((list) => {
        setCompanies(list);
        if (list.length > 0) setCompanyId((current) => current || list[0].id);
      })
      .catch(() => setCompanies([]));
  }, [isGroupAdmin]);

  const ready = !isGroupAdmin || !!companyId;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setIsLoading(true);
      listEmployees({ companyId: isGroupAdmin ? companyId : undefined, search: search.trim() || undefined, limit: PAGE, offset })
        .then((result) => {
          if (cancelled) return;
          setRows((prev) => (offset === 0 ? result.data : [...prev, ...result.data]));
          setTotal(result.pagination.total);
          setError(null);
        })
        .catch(() => {
          if (!cancelled) setError('Could not load employees.');
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [ready, isGroupAdmin, companyId, search, offset]);

  function toggle(e: Employee) {
    const next = new Map(selected);
    if (next.has(e.id)) next.delete(e.id);
    else if (next.size < MAX_REPORT_EMPLOYEES) next.set(e.id, { id: e.id, name: e.name, employeeCode: e.employeeCode });
    onChange(next);
  }

  function selectShown() {
    const next = new Map(selected);
    for (const e of rows) {
      if (next.size >= MAX_REPORT_EMPLOYEES) break;
      next.set(e.id, { id: e.id, name: e.name, employeeCode: e.employeeCode });
    }
    onChange(next);
  }

  function clearShown() {
    const next = new Map(selected);
    rows.forEach((e) => next.delete(e.id));
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {isGroupAdmin && (
          <div className="w-56">
            <Select
              label="Company"
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setOffset(0);
              }}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
        )}
        <div className="min-w-48 flex-1">
          <Input
            label="Search"
            placeholder="Name or employee code"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          Showing {rows.length} of {total}
        </span>
        <span className="flex gap-3">
          <button type="button" className="text-primary hover:underline" onClick={selectShown}>
            Select shown
          </button>
          <button type="button" className="text-primary hover:underline" onClick={clearShown}>
            Clear shown
          </button>
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
        {error ? (
          <p className="px-3 py-2 text-sm text-danger">{error}</p>
        ) : rows.length === 0 && !isLoading ? (
          <p className="px-3 py-2 text-sm text-ink-muted">No employees found.</p>
        ) : (
          <ul>
            {rows.map((e) => (
              <li key={e.id} className="border-b border-border last:border-b-0">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-page">
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e)} />
                  <span className="text-ink">{e.name}</span>
                  {e.employeeCode && <span className="text-xs text-ink-muted">{e.employeeCode}</span>}
                  {e.status !== 'active' && <span className="text-[11px] text-warning">{e.status.replace('_', ' ')}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {rows.length < total && (
          <div className="p-2 text-center">
            <Button variant="secondary" onClick={() => setOffset(rows.length)} isLoading={isLoading}>
              Load more
            </Button>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs text-ink-muted">
          {selected.size} selected{selected.size >= MAX_REPORT_EMPLOYEES && ` (max ${MAX_REPORT_EMPLOYEES})`}
          {selected.size > 0 && (
            <button type="button" className="ml-3 text-primary hover:underline" onClick={() => onChange(new Map())}>
              Clear all
            </button>
          )}
        </p>
        {selected.size > 0 && (
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {[...selected.values()].map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-xs text-primary">
                {label(e)}
                <button
                  type="button"
                  aria-label={`Remove ${e.name ?? ''}`}
                  onClick={() => {
                    const next = new Map(selected);
                    next.delete(e.id);
                    onChange(next);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
