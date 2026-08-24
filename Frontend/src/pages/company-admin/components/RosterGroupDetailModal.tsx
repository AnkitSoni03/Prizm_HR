import { useEffect, useState } from 'react';
import { Plus, RotateCw, UserMinus } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Tabs } from '../../../components/ui/Tabs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmployeeMultiSelect } from '../../../components/ui/EmployeeMultiSelect';
import { useAuth } from '../../../context/auth-context';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import { listEmployees, changeEmployeeRoster, renewEmployeeRoster } from '../../../api/companyAdmin/employees';
import { computeRosterExpiry, daysUntil, rosterExpiryLabel } from '../../../utils/rosterValidity';
import { listShifts } from '../../../api/companyAdmin/attendance';
import { listLeaveTypes, type LeaveType } from '../../../api/companyAdmin/leaveBalance';
import {
  bulkAssignRosterGroup,
  getRosterGroup,
  type RosterPolicyGroup,
  type RosterPolicyGroupDetail,
} from '../../../api/companyAdmin/rosterGroups';
import type { Employee, Shift } from '../../../api/tenancy';
import { formatDisplayDateRange } from '../../../utils/dateDisplay';
import { formatEmployeeLabel } from '../../../utils/employeeDisplay';
import { ShiftFormModal } from './ShiftFormModal';
import { HolidayFormModal } from './HolidayFormModal';
import { PolicyFormModal } from './PolicyFormModal';
import { LeavePolicyFormModal } from './LeavePolicyFormModal';

interface RosterGroupDetailModalProps {
  rosterGroup: RosterPolicyGroup;
  allEmployees: Employee[];
  onClose: () => void;
  onUpdated: () => void;
}

type Tab = 'employees' | 'shifts' | 'holidays' | 'companyPolicies' | 'leavePolicies';

// Everything a Roster's employees inherit can be assigned either from each
// entity's own create/edit form ("Assign to Roster(s)" — see ShiftFormModal,
// HolidayFormModal, PolicyFormModal, LeavePolicyFormModal) OR directly from
// here via the "+ Add" button on each tab, which opens the exact same form
// modal pre-scoped to this Roster — both paths call the same create
// endpoint, so nothing about the underlying data model changes. This modal
// otherwise summarizes what's already linked, plus manages which employees
// are assigned to this Roster.
export function RosterGroupDetailModal({ rosterGroup, allEmployees, onClose, onUpdated }: RosterGroupDetailModalProps) {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canUpdate = hasPermission('roster_group:update');
  const canCreateShift = hasPermission('shift:create');
  const canCreateHoliday = hasPermission('holiday:create');
  const canCreateCompanyPolicy = hasPermission('company_policy:create');
  const canCreateLeavePolicy = hasPermission('leave_policy:create');

  const [activeTab, setActiveTab] = useState<Tab>('employees');

  const [detail, setDetail] = useState<RosterPolicyGroupDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  function loadDetail() {
    getRosterGroup(rosterGroup.id)
      .then(setDetail)
      .catch(() => setDetailError('Could not load this Roster’s assigned Shift/Holidays/Policies.'));
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterGroup.id]);

  function handleLinkedEntitySaved() {
    setDetail(null);
    loadDetail();
    onUpdated();
  }

  // Data the "+ Add" form modals need — fetched lazily, once, the first time
  // any add form is actually opened (not up front for every tab).
  const [shiftsForConflictCheck, setShiftsForConflictCheck] = useState<Shift[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [isAddingShift, setIsAddingShift] = useState(false);
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);
  const [isAddingCompanyPolicy, setIsAddingCompanyPolicy] = useState(false);
  const [isAddingLeavePolicy, setIsAddingLeavePolicy] = useState(false);

  function openAddShift() {
    listShifts().then(setShiftsForConflictCheck).catch(() => setShiftsForConflictCheck([]));
    setIsAddingShift(true);
  }

  function openAddLeavePolicy() {
    listLeaveTypes().then(setLeaveTypes).catch(() => setLeaveTypes([]));
    setIsAddingLeavePolicy(true);
  }

  // Employees currently assigned to this group + candidates to add
  const [assignedEmployees, setAssignedEmployees] = useState<Employee[] | null>(null);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  async function handleRenew(employee: Employee) {
    setRenewingId(employee.id);
    try {
      await renewEmployeeRoster(employee.id);
      await loadAssigned();
      onUpdated();
      showToast(`Renewed ${formatEmployeeLabel(employee)}'s Roster.`, 'success');
    } catch {
      showToast('Could not renew this Roster. Please try again.', 'error');
    } finally {
      setRenewingId(null);
    }
  }
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadAssigned() {
    try {
      const result = await listEmployees({ rosterGroupId: rosterGroup.id, limit: 100 });
      setAssignedEmployees(result.data);
    } catch {
      setAssignedEmployees([]);
    }
  }

  useEffect(() => {
    if (activeTab !== 'employees' || assignedEmployees !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAssigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, assignedEmployees]);

  const assignedIds = new Set((assignedEmployees ?? []).map((e) => e.id));
  const candidateEmployees = allEmployees.filter((e) => !assignedIds.has(e.id));

  async function handleAssign() {
    if (selectedToAdd.length === 0) return;
    setAssignError(null);
    setIsAssigning(true);
    try {
      await bulkAssignRosterGroup(rosterGroup.id, selectedToAdd);
      setSelectedToAdd([]);
      await loadAssigned();
      onUpdated();
    } catch {
      setAssignError('Could not assign these employees. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleRemove(employee: Employee) {
    const confirmed = await confirm({
      title: 'Remove from Roster',
      message: `Remove ${formatEmployeeLabel(employee)} from "${rosterGroup.name}"? Until a new Roster is assigned, their shift, holidays, company policies, and leave balance will show blank.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    setRemovingId(employee.id);
    try {
      // No carry-forward prompt here (this is a one-click "Remove", not the
      // full Change Roster flow) — un-assigning back to no Roster resets
      // their leave balance fresh, same as ChangeRosterModal's "No" choice.
      await changeEmployeeRoster(employee.id, { rosterGroupId: null, carryForward: false });
      await loadAssigned();
      onUpdated();
    } catch {
      showToast('Could not remove this employee from the Roster.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
    <Modal
      title={rosterGroup.name}
      onClose={onClose}
      widthClassName="max-w-2xl"
      tabs={
        <Tabs
          items={[
            { key: 'employees', label: 'Employees' },
            { key: 'shifts', label: 'Shift' },
            { key: 'holidays', label: 'Holidays' },
            { key: 'companyPolicies', label: 'Company Policies' },
            { key: 'leavePolicies', label: 'Leave Policy' },
          ]}
          active={activeTab}
          onChange={(key) => setActiveTab(key as Tab)}
        />
      }
    >
      {activeTab === 'employees' && (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-ink">
              Assigned Employees {assignedEmployees ? `(${assignedEmployees.length})` : ''}
            </p>
            {!assignedEmployees && <p className="text-sm text-ink-muted">Loading…</p>}
            {assignedEmployees && assignedEmployees.length === 0 && (
              <p className="text-sm text-ink-muted">No employees assigned yet.</p>
            )}
            {assignedEmployees && assignedEmployees.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                {assignedEmployees.map((employee) => {
                  const expiryDate = rosterGroup.validityValue
                    ? computeRosterExpiry(employee.rosterAssignedAt, rosterGroup.validityValue, rosterGroup.validityUnit)
                    : null;
                  const remaining = expiryDate ? daysUntil(expiryDate) : null;
                  return (
                    <div
                      key={employee.id}
                      className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-ink">{formatEmployeeLabel(employee)}</span>
                        {remaining !== null && (
                          <Badge tone={remaining <= 3 ? 'danger' : remaining <= 7 ? 'warning' : 'neutral'}>
                            {rosterExpiryLabel(remaining)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {canUpdate && remaining !== null && (
                          <button
                            type="button"
                            onClick={() => handleRenew(employee)}
                            disabled={renewingId === employee.id}
                            aria-label={`Renew ${employee.name}'s Roster`}
                            title="Renew"
                            className="rounded-md p-1 text-ink-muted hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                          >
                            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => handleRemove(employee)}
                            disabled={removingId === employee.id}
                            aria-label={`Remove ${employee.name}`}
                            className="rounded-md p-1 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                          >
                            <UserMinus className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canUpdate && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              {assignError && <p className="text-sm text-danger">{assignError}</p>}
              <EmployeeMultiSelect
                label="Add Employees"
                employees={candidateEmployees}
                selectedIds={selectedToAdd}
                onChange={setSelectedToAdd}
                emptyMessage="Everyone is already assigned to this Roster."
              />
              <Button
                type="button"
                onClick={handleAssign}
                isLoading={isAssigning}
                disabled={selectedToAdd.length === 0}
                className="w-full"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                {selectedToAdd.length > 0 ? `Assign ${selectedToAdd.length} Employee(s)` : 'Assign'}
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab !== 'employees' && detailError && <p className="text-sm text-danger">{detailError}</p>}
      {activeTab !== 'employees' && !detail && !detailError && <p className="text-sm text-ink-muted">Loading…</p>}

      {activeTab === 'shifts' && detail && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">A Roster can have at most one Shift.</p>
            {canCreateShift && detail.shifts.length === 0 && (
              <Button type="button" variant="secondary" onClick={openAddShift}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add Shift
              </Button>
            )}
          </div>
          {detail.shifts.length === 0 ? (
            <p className="text-sm text-ink-muted">No Shift assigned yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {detail.shifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0">
                  <span className="font-medium text-ink">{s.name}</span>
                  <span className="text-xs text-ink-muted">
                    {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'holidays' && detail && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              Holidays only this Roster's employees see — a Roster with none sees no holidays at all.
            </p>
            {canCreateHoliday && (
              <Button type="button" variant="secondary" onClick={() => setIsAddingHoliday(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add
              </Button>
            )}
          </div>
          {detail.holidays.length === 0 ? (
            <p className="text-sm text-ink-muted">No holidays assigned yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {detail.holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0">
                  <span className="font-medium text-ink">{h.name}</span>
                  <span className="text-xs text-ink-muted">{formatDisplayDateRange(h.date, h.endDate)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'companyPolicies' && detail && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              Company Policies only this Roster's employees see — a Roster with none sees no policies at all.
            </p>
            {canCreateCompanyPolicy && (
              <Button type="button" variant="secondary" onClick={() => setIsAddingCompanyPolicy(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add
              </Button>
            )}
          </div>
          {detail.companyPolicies.length === 0 ? (
            <p className="text-sm text-ink-muted">No policies assigned yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {detail.companyPolicies.map((p) => (
                <div key={p.id} className="border-b border-border px-3 py-2 text-sm last:border-b-0">
                  <p className="font-medium text-ink">{p.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'leavePolicies' && detail && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              This Roster's employees only get leave types with a policy assigned here.
            </p>
            {canCreateLeavePolicy && (
              <Button type="button" variant="secondary" onClick={openAddLeavePolicy}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Add
              </Button>
            )}
          </div>
          {detail.leavePolicies.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No leave policies assigned yet — this Roster's employees have no leave balance until one is added.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {detail.leavePolicies.map((policy) => (
                <div key={policy.id} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0">
                  <div>
                    <p className="font-medium text-ink">{policy.leaveType?.name ?? policy.leaveTypeId}</p>
                    <p className="text-xs text-ink-muted">
                      {policy.annualQuota} days/year · {policy.accrual.replace('_', ' ')}
                    </p>
                  </div>
                  <Badge tone="success">Assigned</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>

    {isAddingShift && (
      <ShiftFormModal
        shifts={shiftsForConflictCheck}
        defaultRosterGroupIds={[rosterGroup.id]}
        onClose={() => setIsAddingShift(false)}
        onSaved={handleLinkedEntitySaved}
      />
    )}

    {isAddingHoliday && (
      <HolidayFormModal
        defaultRosterGroupIds={[rosterGroup.id]}
        onClose={() => setIsAddingHoliday(false)}
        onSaved={handleLinkedEntitySaved}
      />
    )}

    {isAddingCompanyPolicy && (
      <PolicyFormModal
        defaultRosterGroupIds={[rosterGroup.id]}
        onClose={() => setIsAddingCompanyPolicy(false)}
        onSaved={handleLinkedEntitySaved}
      />
    )}

    {isAddingLeavePolicy && (
      <LeavePolicyFormModal
        leaveTypes={leaveTypes}
        defaultRosterGroupIds={[rosterGroup.id]}
        onLeaveTypeCreated={(leaveType) => setLeaveTypes((prev) => [...prev, leaveType])}
        onClose={() => setIsAddingLeavePolicy(false)}
        onSaved={handleLinkedEntitySaved}
      />
    )}
    </>
  );
}
