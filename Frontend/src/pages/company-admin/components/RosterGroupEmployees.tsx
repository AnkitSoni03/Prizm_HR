import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Employee, ShiftRoster } from '../../../api/tenancy';

interface RosterGroupEmployeesProps {
  entries: ShiftRoster[];
  employees: Employee[];
  canUpdate: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onEdit: (roster: ShiftRoster) => void;
  onDelete: (roster: ShiftRoster) => void;
  onAddEmployees: () => void;
}

// One chip per underlying shift_rosters row within a grouped (date, shift)
// roster — each row is still one employee's own slot for that date, so edit
// and delete stay per-entry even though the table only shows one visual row
// for the whole group. The trailing "+ Add" chip adds more employees to this
// same shift+date group without re-picking shift/date/brand.
export function RosterGroupEmployees({
  entries,
  employees,
  canUpdate,
  canDelete,
  canCreate,
  onEdit,
  onDelete,
  onAddEmployees,
}: RosterGroupEmployeesProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((entry) => {
        const employee = entry.employeeId ? employees.find((e) => e.id === entry.employeeId) : null;
        const label = entry.employeeId ? (employee ? `${employee.name} (${employee.employeeCode})` : entry.employeeId) : 'Unassigned';
        return (
          <span
            key={entry.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2 py-0.5 text-xs text-ink"
          >
            <span className={entry.employeeId ? undefined : 'text-ink-muted'}>{label}</span>
            <span
              className={[
                'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize',
                entry.status === 'published' ? 'bg-success/10 text-success' : 'bg-muted text-ink-muted',
              ].join(' ')}
            >
              {entry.status}
            </span>
            {canUpdate && (
              <button
                type="button"
                onClick={() => onEdit(entry)}
                aria-label={`Edit ${label}`}
                className="rounded p-0.5 text-ink-muted hover:bg-card hover:text-ink"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.75} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(entry)}
                aria-label={`Delete ${label}`}
                className="rounded p-0.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-3 w-3" strokeWidth={1.75} />
              </button>
            )}
          </span>
        );
      })}
      {canCreate && (
        <button
          type="button"
          onClick={onAddEmployees}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/5"
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          Add Employees
        </button>
      )}
    </div>
  );
}
