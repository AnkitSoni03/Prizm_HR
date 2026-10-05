import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { formatEmployeeLabel } from '../../utils/employeeDisplay';
import {
  listManagerCompanies,
  listManagerEmployees,
  type ManagerCompanyOption,
  type ManagerEmployeeOption,
} from '../../api/companyAdmin/employees';

interface GroupManagerPickerProps {
  id: string;
  label: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  // The employee being edited — never offered as their own manager.
  excludeEmployeeId?: string;
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
}

// One pickable unit: a Brand, or a direct-mode Company (no Brands).
interface OrgUnit {
  key: string;
  companyId: string;
  brandId?: string;
  label: string;
  isOwnCompany: boolean;
}

function toUnits(companies: ManagerCompanyOption[]): OrgUnit[] {
  const units: OrgUnit[] = [];
  for (const company of companies) {
    if (company.usesBrands) {
      for (const brand of company.brands) {
        units.push({
          key: `${company.id}:${brand.id}`,
          companyId: company.id,
          brandId: brand.id,
          label: `${company.name} › ${brand.name}`,
          isOwnCompany: company.isOwnCompany,
        });
      }
    } else {
      units.push({ key: company.id, companyId: company.id, label: company.name, isOwnCompany: company.isOwnCompany });
    }
  }
  // Own company first, then alphabetical (server already sorts by name).
  return units.sort((a, b) => Number(b.isOwnCompany) - Number(a.isOwnCompany));
}

function orgSuffix(employee: ManagerEmployeeOption) {
  return [employee.company?.name, employee.brand?.name].filter(Boolean).join(' › ');
}

// The Employee form's "Manager" field. One employee can have several
// managers and EVERY one of them must approve their leave, OD and comp-off
// (see Backend utils/managerApprovals.js). A manager may be in any Company
// or Brand of the Group, so picking is two steps: first a Company/Brand,
// then that unit's employees. Selections from different units add up.
export function GroupManagerPicker({
  id,
  label,
  selectedIds,
  onChange,
  excludeEmployeeId,
  placeholder = 'No manager',
  disabled = false,
  helperText,
}: GroupManagerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [units, setUnits] = useState<OrgUnit[] | null>(null);
  const [unitsError, setUnitsError] = useState(false);
  const [activeUnit, setActiveUnit] = useState<OrgUnit | null>(null);
  const [unitFilter, setUnitFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [employees, setEmployees] = useState<ManagerEmployeeOption[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  // Every employee seen so far, by id — labels the selected chips, even for
  // managers picked from another unit than the one currently open.
  const [known, setKnown] = useState<Record<string, ManagerEmployeeOption>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function remember(rows: ManagerEmployeeOption[]) {
    if (rows.length === 0) return;
    setKnown((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.id] = row;
      return next;
    });
  }

  // Resolve labels for selected managers we haven't seen yet (e.g. the
  // existing managers when the edit form first opens).
  const unknownIds = selectedIds.filter((selectedId) => !known[selectedId]);
  const unknownKey = unknownIds.join(',');
  useEffect(() => {
    if (!unknownKey) return;
    listManagerEmployees({ ids: unknownKey.split(',') })
      .then(remember)
      .catch(() => {});
  }, [unknownKey]);

  // Lazily load the Group's companies/brands on first open.
  useEffect(() => {
    if (!isOpen || units !== null) return;
    listManagerCompanies()
      .then((companies) => setUnits(toUnits(companies)))
      .catch(() => setUnitsError(true));
  }, [isOpen, units]);

  // Load the picked unit's employees (debounced server-side search).
  useEffect(() => {
    if (!activeUnit) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setIsLoadingEmployees(true);
      listManagerEmployees({
        companyId: activeUnit.companyId,
        brandId: activeUnit.brandId,
        search: employeeFilter || undefined,
      })
        .then((rows) => {
          if (cancelled) return;
          setEmployees(rows);
          remember(rows);
        })
        .catch(() => {
          if (!cancelled) setEmployees([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingEmployees(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [activeUnit, employeeFilter]);

  function toggle(employeeId: string) {
    onChange(
      selectedIds.includes(employeeId) ? selectedIds.filter((id_) => id_ !== employeeId) : [...selectedIds, employeeId]
    );
  }

  function openUnit(unit: OrgUnit) {
    setEmployees([]);
    setEmployeeFilter('');
    setActiveUnit(unit);
  }

  const filteredUnits = useMemo(
    () => (units ?? []).filter((unit) => unit.label.toLowerCase().includes(unitFilter.toLowerCase())),
    [units, unitFilter]
  );
  const visibleEmployees = employees.filter((e) => e.id !== excludeEmployeeId);

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full min-h-[42px] items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-base text-ink transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border sm:text-sm"
      >
        {selectedIds.length === 0 ? (
          <span className="text-ink-muted">{placeholder}</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selectedIds.map((selectedId) => {
              const employee = known[selectedId];
              const suffix = employee ? orgSuffix(employee) : '';
              return (
                <span
                  key={selectedId}
                  title={suffix || undefined}
                  className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
                >
                  <span className="shrink-0">{employee ? formatEmployeeLabel(employee) : 'Loading…'}</span>
                  {suffix && <span className="min-w-0 truncate font-normal text-primary/70">· {suffix}</span>}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label="Remove manager"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(selectedId);
                    }}
                    className="shrink-0 hover:text-danger"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                </span>
              );
            })}
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
      </button>
      {helperText && <p className="mt-1 text-xs text-ink-muted">{helperText}</p>}

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card shadow-lg">
          {!activeUnit ? (
            <>
              <div className="border-b border-border px-3 pt-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Step 1 · Pick a company / brand
              </div>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
                <input
                  autoFocus
                  type="text"
                  value={unitFilter}
                  onChange={(event) => setUnitFilter(event.target.value)}
                  placeholder="Search companies or brands…"
                  className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {unitsError && <p className="px-2 py-2 text-xs text-danger">Could not load companies.</p>}
                {!unitsError && units === null && <p className="px-2 py-2 text-xs text-ink-muted">Loading…</p>}
                {units !== null && filteredUnits.length === 0 && (
                  <p className="px-2 py-2 text-xs text-ink-muted">No companies or brands found.</p>
                )}
                {filteredUnits.map((unit) => (
                  <button
                    key={unit.key}
                    type="button"
                    onClick={() => openUnit(unit)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-page"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{unit.label}</span>
                    {unit.isOwnCompany && <span className="shrink-0 text-xs text-ink-muted">Your company</span>}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setActiveUnit(null)}
                className="flex w-full items-center gap-1.5 border-b border-border px-3 py-2 text-left text-xs font-medium text-primary hover:bg-page"
              >
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span className="truncate">{activeUnit.label}</span>
              </button>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
                <input
                  autoFocus
                  type="text"
                  value={employeeFilter}
                  onChange={(event) => setEmployeeFilter(event.target.value)}
                  placeholder="Search employees…"
                  className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {isLoadingEmployees && visibleEmployees.length === 0 && (
                  <p className="px-2 py-2 text-xs text-ink-muted">Loading…</p>
                )}
                {!isLoadingEmployees && visibleEmployees.length === 0 && (
                  <p className="px-2 py-2 text-xs text-ink-muted">No employees found.</p>
                )}
                {visibleEmployees.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-page"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(employee.id)}
                      onChange={() => toggle(employee.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                    />
                    <span className="text-ink">{formatEmployeeLabel(employee)}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
