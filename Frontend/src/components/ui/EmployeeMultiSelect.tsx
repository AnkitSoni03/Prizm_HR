import { useState } from 'react';
import type { Employee } from '../../api/tenancy';

interface EmployeeMultiSelectProps {
  label: string;
  employees: Employee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyMessage?: string;
}

// Checkbox list with a search filter and select-all/clear — used wherever an
// admin needs to pick several employees at once (bulk shift/roster
// assignment). Deliberately not built on <Select multiple> — a native
// multi-select's UX (ctrl/cmd-click, no search, no visible checkmarks) is
// poor for lists that can run into the hundreds.
export function EmployeeMultiSelect({
  label,
  employees,
  selectedIds,
  onChange,
  emptyMessage = 'No employees available.',
}: EmployeeMultiSelectProps) {
  const [search, setSearch] = useState('');

  const filtered = employees.filter((employee) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return employee.name.toLowerCase().includes(q) || (employee.employeeCode?.toLowerCase().includes(q) ?? false);
  });

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  function selectAllFiltered() {
    const ids = new Set(selectedIds);
    filtered.forEach((employee) => ids.add(employee.id));
    onChange([...ids]);
  }

  function clearFiltered() {
    const filteredIds = new Set(filtered.map((employee) => employee.id));
    onChange(selectedIds.filter((id) => !filteredIds.has(id)));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-sm font-medium text-ink">{label}</label>
        <span className="text-xs text-ink-muted">{selectedIds.length} selected</span>
      </div>
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name or code…"
        className="mb-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="mb-2 flex gap-3 text-xs">
        <button type="button" onClick={selectAllFiltered} className="font-medium text-primary hover:underline">
          Select all{search ? ' (filtered)' : ''}
        </button>
        <button type="button" onClick={clearFiltered} className="font-medium text-ink-muted hover:underline">
          Clear{search ? ' (filtered)' : ''}
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-card">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-ink-muted">{emptyMessage}</p>
        ) : (
          filtered.map((employee) => (
            <label
              key={employee.id}
              className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm text-ink last:border-b-0 hover:bg-page"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(employee.id)}
                onChange={() => toggle(employee.id)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
              />
              <span>
                {employee.name}
                {employee.employeeCode && <span className="text-ink-muted"> ({employee.employeeCode})</span>}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
