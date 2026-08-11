import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Tabs } from '../../components/ui/Tabs';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/auth-context';
import { useConfirm } from '../../context/confirm-context';
import { useToast } from '../../context/toast-context';
import { deleteShift, deleteShiftRoster, listShiftRosters, listShifts } from '../../api/companyAdmin/attendance';
import { listBrands } from '../../api/companyAdmin/org';
import { listEmployees } from '../../api/companyAdmin/employees';
import type { Brand, Employee, Shift, ShiftRoster } from '../../api/tenancy';
import { ShiftFormModal } from '../company-admin/components/ShiftFormModal';
import { RosterFormModal } from '../company-admin/components/RosterFormModal';
import { RosterEditModal } from '../company-admin/components/RosterEditModal';
import { RosterGroupEmployees } from '../company-admin/components/RosterGroupEmployees';
import { AddRosterEmployeesModal } from '../company-admin/components/AddRosterEmployeesModal';
import { formatDisplayDate } from '../../utils/dateDisplay';
import { groupRosters, type RosterGroup } from '../../utils/rosterGrouping';

type Tab = 'shifts' | 'rosters';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Shifts now get the same create/update/delete UI Company Admin has (Brand
// Admin was granted shift:create/update/delete alongside employee/
// department/designation write access — see
// 20260713100000-seed-brand-admin-full-power-permissions.js). Shift
// definitions are still company-wide (no brand_id column exists on
// `shifts`), so a Shift a Brand Admin creates/edits here is visible
// company-wide, same as one Company Admin creates. Rosters remain
// brand-scoped via shift_roster:create/update (see
// 20260711100000-seed-group-brand-admin-portal-permissions.js).
export function ShiftsRostersPage() {
  const { user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const brandId = user?.roles.find((role) => role.name === 'Brand Admin')?.brandId ?? null;
  const ownBrand = useOwnBrand(brandId);

  const [activeTab, setActiveTab] = useState<Tab>('shifts');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rosters, setRosters] = useState<ShiftRoster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRostersLoading, setIsRostersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | 'new' | null>(null);
  const [isRosterModalOpen, setIsRosterModalOpen] = useState(false);
  const [editingRoster, setEditingRoster] = useState<ShiftRoster | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<RosterGroup | null>(null);

  async function loadShifts() {
    try {
      setShifts(await listShifts());
    } catch {
      setError('Could not load shifts.');
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
      await deleteShift(shift.id);
      loadShifts();
    } catch {
      showToast('Could not delete this shift — it may still be in use by an employee shift or roster.');
    }
  }

  async function handleDeleteRoster(roster: ShiftRoster) {
    const employee = roster.employeeId ? employees.find((e) => e.id === roster.employeeId) : null;
    const label = employee ? `${employee.name} (${employee.employeeCode})` : 'this unassigned slot';
    const confirmed = await confirm({
      title: 'Delete roster entry',
      message: `Delete the roster entry for ${label} on ${formatDisplayDate(roster.rosterDate)}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteShiftRoster(roster.id);
      loadRosters();
    } catch {
      showToast('Could not delete this roster entry. Please try again.');
    }
  }

  async function loadRosters() {
    if (!brandId) return;
    setIsRostersLoading(true);
    try {
      setRosters(await listShiftRosters({ brandId }));
    } catch {
      setError('Could not load rosters.');
    } finally {
      setIsRostersLoading(false);
    }
  }

  useEffect(() => {
    if (!brandId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('No Brand is linked to this account.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    Promise.all([listShifts(), listEmployees({ brandId, limit: 100 })])
      .then(([s, emp]) => {
        setShifts(s);
        setEmployees(emp.data);
      })
      .catch(() => setError('Could not load shifts.'))
      .finally(() => setIsLoading(false));
  }, [brandId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab === 'rosters') loadRosters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, brandId]);

  return (
    <div>
      <Tabs
        items={[
          { key: 'shifts', label: 'Shifts' },
          { key: 'rosters', label: 'Rosters' },
        ]}
        active={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
      />

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {activeTab === 'shifts' && (
        <div>
          {hasPermission('shift:create') && (
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" onClick={() => setEditingShift('new')}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Shift
              </Button>
            </div>
          )}
          <Table
            isLoading={isLoading}
            rows={shifts}
            rowKey={(shift) => shift.id}
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (shift) => (
                  <span className="font-medium text-ink">
                    {shift.name}
                    {shift.isNightShift && <span className="ml-2 text-xs font-normal text-ink-muted">(night)</span>}
                  </span>
                ),
              },
              {
                key: 'hours',
                header: 'Hours',
                render: (shift) => `${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)}`,
              },
              {
                key: 'weeklyOff',
                header: 'Weekly Off',
                render: (shift) =>
                  shift.weeklyOffDays.length > 0
                    ? shift.weeklyOffDays.map((d) => WEEKDAY_LABELS[d]).join(', ')
                    : '—',
              },
              {
                key: 'actions',
                header: '',
                className: 'w-24 text-right',
                render: (shift) =>
                  (hasPermission('shift:update') || hasPermission('shift:delete')) && (
                    <div className="flex justify-end gap-1">
                      {hasPermission('shift:update') && (
                        <button
                          type="button"
                          onClick={() => setEditingShift(shift)}
                          aria-label={`Edit ${shift.name}`}
                          className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                      {hasPermission('shift:delete') && (
                        <button
                          type="button"
                          onClick={() => handleDeleteShift(shift)}
                          aria-label={`Delete ${shift.name}`}
                          className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  ),
              },
            ]}
          />
        </div>
      )}

      {activeTab === 'rosters' && (
        <div>
          <div className="mb-3 flex justify-end">
            {hasPermission('shift_roster:create') && (
              <Button variant="secondary" onClick={() => setIsRosterModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Create Roster
              </Button>
            )}
          </div>
          <Table
            isLoading={isRostersLoading}
            rows={groupRosters(rosters)}
            rowKey={(group) => group.key}
            emptyMessage="No roster entries found."
            columns={[
              { key: 'date', header: 'Date', className: 'w-32', render: (g) => formatDisplayDate(g.rosterDate) },
              { key: 'shift', header: 'Shift', className: 'w-32', render: (g) => g.entries[0]?.shift?.name ?? '—' },
              {
                key: 'employees',
                header: 'Employees',
                render: (g) => (
                  <RosterGroupEmployees
                    entries={g.entries}
                    employees={employees}
                    canUpdate={hasPermission('shift_roster:update')}
                    canDelete={hasPermission('shift_roster:delete')}
                    canCreate={hasPermission('shift_roster:create')}
                    onEdit={setEditingRoster}
                    onDelete={handleDeleteRoster}
                    onAddEmployees={() => setAddingToGroup(g)}
                  />
                ),
              },
            ]}
          />
        </div>
      )}

      {editingShift && (
        <ShiftFormModal
          shift={editingShift === 'new' ? undefined : editingShift}
          shifts={shifts}
          onClose={() => setEditingShift(null)}
          onSaved={loadShifts}
        />
      )}

      {isRosterModalOpen && ownBrand && (
        <RosterFormModal
          brands={[ownBrand]}
          shifts={shifts}
          employees={employees}
          onClose={() => setIsRosterModalOpen(false)}
          onCreated={loadRosters}
        />
      )}

      {editingRoster && (
        <RosterEditModal
          roster={editingRoster}
          employees={employees}
          onClose={() => setEditingRoster(null)}
          onSaved={loadRosters}
        />
      )}

      {addingToGroup && (
        <AddRosterEmployeesModal
          group={addingToGroup}
          shiftName={addingToGroup.entries[0]?.shift?.name ?? '—'}
          employees={employees}
          onClose={() => setAddingToGroup(null)}
          onCreated={loadRosters}
        />
      )}
    </div>
  );
}

// listBrands() is company-wide (Brand Admin has plain brand:read, same as
// Company Admin), so this resolves just the caller's own Brand object from
// it — needed because RosterFormModal takes a full Brand (id + name), not
// just an id.
function useOwnBrand(brandId: string | null): Brand | null {
  const [brand, setBrand] = useState<Brand | null>(null);

  useEffect(() => {
    if (!brandId) return;
    listBrands()
      .then((brands) => setBrand(brands.find((b) => b.id === brandId) ?? null))
      .catch(() => setBrand(null));
  }, [brandId]);

  return brand;
}
