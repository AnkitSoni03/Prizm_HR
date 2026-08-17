import { useEffect, useState } from 'react';
import { Plus, UserMinus } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Tabs } from '../../../components/ui/Tabs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmployeeMultiSelect } from '../../../components/ui/EmployeeMultiSelect';
import { useAuth } from '../../../context/auth-context';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import { listEmployees, updateEmployee } from '../../../api/companyAdmin/employees';
import {
  bulkAssignRosterGroup,
  getRosterGroup,
  type RosterPolicyGroup,
  type RosterPolicyGroupDetail,
} from '../../../api/companyAdmin/rosterGroups';
import type { Employee } from '../../../api/tenancy';
import { formatDisplayDateRange } from '../../../utils/dateDisplay';
import { formatEmployeeLabel } from '../../../utils/employeeDisplay';

interface RosterGroupDetailModalProps {
  rosterGroup: RosterPolicyGroup;
  allEmployees: Employee[];
  onClose: () => void;
  onUpdated: () => void;
}

type Tab = 'employees' | 'shifts' | 'holidays' | 'companyPolicies' | 'leavePolicies';

// Everything a Roster's employees inherit is assigned FROM each entity's own
// create/edit form ("Assign to Roster(s)" — see ShiftFormModal,
// HolidayFormModal, PolicyFormModal, LeavePolicyFormModal), not from here.
// This modal is a read-only summary of those links, plus the one thing that
// IS managed from here: which employees are assigned to this Roster.
export function RosterGroupDetailModal({ rosterGroup, allEmployees, onClose, onUpdated }: RosterGroupDetailModalProps) {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const canUpdate = hasPermission('roster_group:update');

  const [activeTab, setActiveTab] = useState<Tab>('employees');

  const [detail, setDetail] = useState<RosterPolicyGroupDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    getRosterGroup(rosterGroup.id)
      .then(setDetail)
      .catch(() => setDetailError('Could not load this Roster’s assigned Shift/Holidays/Policies.'));
  }, [rosterGroup.id]);

  // Employees currently assigned to this group + candidates to add
  const [assignedEmployees, setAssignedEmployees] = useState<Employee[] | null>(null);
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
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
      message: `Remove ${formatEmployeeLabel(employee)} from "${rosterGroup.name}"? They'll fall back to their own default shift and the company-wide holidays/policies/leave policy.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!confirmed) return;
    setRemovingId(employee.id);
    try {
      await updateEmployee(employee.id, { rosterGroupId: null });
      await loadAssigned();
      onUpdated();
    } catch {
      showToast('Could not remove this employee from the Roster.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
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
                {assignedEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-b-0"
                  >
                    <span className="text-ink">{formatEmployeeLabel(employee)}</span>
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
                ))}
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
          <p className="text-sm text-ink-muted">
            A Roster can have at most one Shift — assign it from the Shift's own create/edit form.
          </p>
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
          <p className="text-sm text-ink-muted">
            Extra holidays only this Roster's employees see, on top of company/brand-wide ones —
            assign from the Holidays page.
          </p>
          {detail.holidays.length === 0 ? (
            <p className="text-sm text-ink-muted">No Roster-specific holidays yet.</p>
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
          <p className="text-sm text-ink-muted">
            Company Policies only this Roster's employees see, on top of company-wide ones —
            assign from the Company Policies page.
          </p>
          {detail.companyPolicies.length === 0 ? (
            <p className="text-sm text-ink-muted">No Roster-specific policies yet.</p>
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
          <p className="text-sm text-ink-muted">
            Overrides the company-wide leave quota for this Roster's employees, per leave type —
            assign from the Leave Policy Settings page.
          </p>
          {detail.leavePolicies.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No overrides yet — this Roster's employees use the company-wide leave policy.
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
                  <Badge tone="success">Override</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
