import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { formatEmployeeLabel } from '../../utils/employeeDisplay';
import type { Employee } from '../../api/tenancy';

interface ManagerComboboxProps {
  id: string;
  label: string;
  employees: Employee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
}

// A closed-by-default combobox — click to open a search + checkbox list,
// click outside to close (same pattern as NotificationBell.tsx). This
// codebase's single "Manager" field, in both EmployeeFormModal.tsx (create)
// and EmployeeDetailModal.tsx (edit) — one employee can have more than one
// manager, and a leave request needs every one of them to approve before it
// finalizes (see leaveRequest.service.js). Deliberately a distinct component
// from EmployeeMultiSelect (an always-open checkbox list with select-all/
// clear, used for bulk employee picking elsewhere) — this one needs to sit
// compactly inline as a single form field, closed until clicked.
export function ManagerCombobox({
  id,
  label,
  employees,
  selectedIds,
  onChange,
  placeholder = 'No manager',
  disabled = false,
  helperText,
}: ManagerComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
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

  function toggle(employeeId: string) {
    onChange(
      selectedIds.includes(employeeId) ? selectedIds.filter((id_) => id_ !== employeeId) : [...selectedIds, employeeId]
    );
  }

  const selectedEmployees = selectedIds
    .map((selectedId) => employees.find((e) => e.id === selectedId))
    .filter((e): e is Employee => Boolean(e));

  const filteredEmployees = employees.filter((e) =>
    formatEmployeeLabel(e).toLowerCase().includes(filter.toLowerCase())
  );

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
        {selectedEmployees.length === 0 ? (
          <span className="text-ink-muted">{placeholder}</span>
        ) : (
          <span className="flex flex-1 flex-wrap gap-1.5">
            {selectedEmployees.map((employee) => (
              <span
                key={employee.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary"
              >
                {formatEmployeeLabel(employee)}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(employee.id);
                  }}
                  className="hover:text-danger"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
      </button>
      {helperText && <p className="mt-1 text-xs text-ink-muted">{helperText}</p>}

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" strokeWidth={1.75} />
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search employees…"
              className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1.5">
            {filteredEmployees.length === 0 && (
              <p className="px-2 py-2 text-xs text-ink-muted">No employees found.</p>
            )}
            {filteredEmployees.map((employee) => (
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
        </div>
      )}
    </div>
  );
}
