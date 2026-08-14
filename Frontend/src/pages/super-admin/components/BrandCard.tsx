import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Tabs } from '../../../components/ui/Tabs';
import { Avatar } from '../../../components/ui/Avatar';
import { ShiftFormModal } from './ShiftFormModal';
import { CreateRosterModal } from './CreateRosterModal';
import { EmployeeFormModal } from './EmployeeFormModal';
import { EditBrandModal } from './EditBrandModal';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import {
  deleteShift,
  listEmployees,
  listShiftRosters,
  type Brand,
  type Department,
  type Designation,
  type Employee,
  type Shift,
  type ShiftRoster,
} from '../../../api/tenancy';

interface BrandCardProps {
  // null represents the company-level roster/employee panel for a company
  // that operates directly (companies.uses_brands = false).
  brand: Brand | null;
  companyId: string;
  shifts: Shift[];
  departments: Department[];
  designations: Designation[];
  rosterCount: number;
  canManageShifts: boolean;
  canCreateRoster: boolean;
  canCreateEmployee: boolean;
  canEdit: boolean;
  onShiftsChanged: () => void;
  onRosterCreated: () => void;
  onBrandSaved: () => void;
  onDepartmentCreated: (department: Department) => void;
  onDesignationCreated: (designation: Designation) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type PanelTab = 'shifts' | 'rosters' | 'employees';

export function BrandCard({
  brand,
  companyId,
  shifts,
  departments,
  designations,
  rosterCount,
  canManageShifts,
  canCreateRoster,
  canCreateEmployee,
  canEdit,
  onShiftsChanged,
  onRosterCreated,
  onBrandSaved,
  onDepartmentCreated,
  onDesignationCreated,
}: BrandCardProps) {
  const confirm = useConfirm();
  const showToast = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>('shifts');
  const [rosters, setRosters] = useState<ShiftRoster[] | null>(null);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | 'new' | null>(null);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const brandId = brand?.id;

  async function loadRosters() {
    setIsLoading(true);
    setError(null);
    try {
      setRosters(await listShiftRosters({ companyId, brandId }));
    } catch {
      setError('Could not load rosters.');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadEmployees() {
    try {
      setEmployees(await listEmployees({ companyId, brandId }));
    } catch {
      // Surfaced inline in the Employees section below rather than blocking
      // the whole panel — Shifts/Rosters remain usable either way.
    }
  }

  function toggleExpand() {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next && rosters === null) {
      loadRosters();
      loadEmployees();
    }
  }

  async function handleDeleteShift(shift: Shift) {
    const confirmed = await confirm({
      title: 'Delete shift',
      message: `Delete shift "${shift.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteShift(shift.id, companyId);
      onShiftsChanged();
    } catch {
      showToast('Could not delete this shift — it may still be in use by an employee shift or roster.');
    }
  }

  function handleRosterCreated() {
    loadRosters();
    onRosterCreated();
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex w-full items-center justify-between px-4 py-2.5">
        <button
          type="button"
          onClick={toggleExpand}
          className="flex flex-1 items-center gap-3 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          )}
          <div>
            <p className="text-sm font-medium text-ink">{brand ? brand.name : 'Company level'}</p>
            <p className="text-xs text-ink-muted">
              {brand
                ? `${brand.code ? `Code: ${brand.code}` : '—'}${
                    brand.city || brand.state
                      ? ` · ${[brand.city, brand.state].filter(Boolean).join(', ')}`
                      : ''
                  }`
                : 'Rosters and employees for this company directly'}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Badge tone={rosterCount > 0 ? 'success' : 'warning'}>
            {rosterCount > 0 ? 'Roster set' : 'No roster yet'}
          </Badge>
          {brand && (
            <Badge tone={brand.isActive ? 'success' : 'neutral'}>
              {brand.isActive ? 'active' : 'inactive'}
            </Badge>
          )}
          {brand && canEdit && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              aria-label={`Edit ${brand.name}`}
              title="Edit Brand"
              className="rounded-md p-1.5 text-ink-muted hover:bg-primary/10 hover:text-primary"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-page px-4 py-3">
          <Tabs
            items={[
              { key: 'shifts', label: 'Shifts' },
              { key: 'rosters', label: 'Rosters' },
              { key: 'employees', label: 'Employees' },
            ]}
            active={panelTab}
            onChange={(key) => setPanelTab(key as PanelTab)}
          />

          {panelTab === 'shifts' && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Shared across this Company
                </p>
                {canManageShifts && (
                  <Button variant="secondary" onClick={() => setEditingShift('new')}>
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Add Shift
                  </Button>
                )}
              </div>
              {shifts.length === 0 && <p className="text-sm text-ink-muted">No shifts defined yet.</p>}
              {shifts.length > 0 && (
                <div className="space-y-2">
                  {shifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {shift.name}
                          {shift.isNightShift && (
                            <span className="ml-2 text-xs font-normal text-ink-muted">(night)</span>
                          )}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {shift.startTime.slice(0, 5)}–{shift.endTime.slice(0, 5)}
                          {shift.weeklyOffDays.length > 0
                            ? ` · Off: ${shift.weeklyOffDays.map((d) => WEEKDAY_LABELS[d]).join(', ')}`
                            : ''}
                        </p>
                      </div>
                      {canManageShifts && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingShift(shift)}
                            aria-label={`Edit ${shift.name}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteShift(shift)}
                            aria-label={`Delete ${shift.name}`}
                            className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {panelTab === 'rosters' && (
            <div>
              <div className="mb-2 flex items-center justify-end">
                {canCreateRoster && (
                  <Button
                    variant="secondary"
                    onClick={() => setIsRosterModalOpen(true)}
                    disabled={shifts.length === 0}
                    title={shifts.length === 0 ? 'Create a shift first' : undefined}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Create Roster
                  </Button>
                )}
              </div>
              {isLoading && <p className="text-sm text-ink-muted">Loading rosters…</p>}
              {error && <p className="text-sm text-danger">{error}</p>}
              {!isLoading && !error && rosters?.length === 0 && (
                <p className="text-sm text-ink-muted">No roster entries yet.</p>
              )}
              {!isLoading && rosters && rosters.length > 0 && (
                <div className="space-y-2">
                  {rosters.map((roster) => (
                    <div
                      key={roster.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink">{roster.rosterDate}</p>
                        <p className="text-xs text-ink-muted">
                          {roster.shift?.name ?? '—'}
                          {roster.employeeId ? '' : ' · unassigned slot'}
                        </p>
                      </div>
                      <Badge tone={roster.status === 'published' ? 'success' : 'neutral'}>
                        {roster.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {panelTab === 'employees' && (
            <div>
              <div className="mb-2 flex items-center justify-end">
                {canCreateEmployee && (
                  <Button
                    variant="secondary"
                    onClick={() => setIsEmployeeModalOpen(true)}
                    disabled={departments.length === 0}
                    title={departments.length === 0 ? 'Create a department first' : undefined}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Add Employee
                  </Button>
                )}
              </div>
              {employees?.length === 0 && <p className="text-sm text-ink-muted">No employees yet.</p>}
              {employees && employees.length > 0 && (
                <div className="space-y-2">
                  {employees.map((employee) => (
                    <div
                      key={employee.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar src={employee.photoDownloadUrl} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-ink">{employee.name}</p>
                          <p className="text-xs text-ink-muted">
                            {employee.employeeCode} ·{' '}
                            {departments.find((d) => d.id === employee.departmentId)?.name ?? '—'}
                            {employee.designationId
                              ? ` · ${designations.find((d) => d.id === employee.designationId)?.title ?? '—'}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <Badge tone={employee.status === 'active' ? 'success' : 'neutral'}>
                        {employee.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editingShift && (
        <ShiftFormModal
          companyId={companyId}
          shift={editingShift === 'new' ? undefined : editingShift}
          shifts={shifts}
          onClose={() => setEditingShift(null)}
          onSaved={onShiftsChanged}
        />
      )}

      {isRosterModalOpen && (
        <CreateRosterModal
          companyId={companyId}
          brandId={brandId}
          shifts={shifts}
          onClose={() => setIsRosterModalOpen(false)}
          onCreated={handleRosterCreated}
        />
      )}

      {isEmployeeModalOpen && (
        <EmployeeFormModal
          companyId={companyId}
          brandId={brandId}
          departments={departments}
          designations={designations}
          employees={employees ?? []}
          onClose={() => setIsEmployeeModalOpen(false)}
          onCreated={loadEmployees}
          onDepartmentCreated={onDepartmentCreated}
          onDesignationCreated={onDesignationCreated}
        />
      )}

      {isEditModalOpen && brand && (
        <EditBrandModal
          brand={brand}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={onBrandSaved}
        />
      )}
    </div>
  );
}
