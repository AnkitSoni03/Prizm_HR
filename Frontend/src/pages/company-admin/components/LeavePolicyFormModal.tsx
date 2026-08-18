import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { RosterMultiSelect } from '../../../components/ui/RosterMultiSelect';
import { useAuth } from '../../../context/auth-context';
import { createLeavePolicy, updateLeavePolicy, type LeavePolicy } from '../../../api/companyAdmin/leavePolicies';
import { listRosterGroups, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import type { LeaveType } from '../../../api/companyAdmin/leaveBalance';
import { LeaveTypeFormModal } from './LeaveTypeFormModal';

interface LeavePolicyFormModalProps {
  policy?: LeavePolicy;
  leaveTypes: LeaveType[];
  // Pre-selects these Rosters — used when this modal is opened from inside a
  // Roster's own detail view ("Add Leave Policy" right there). Ignored when
  // editing an existing policy (its own rosterGroups win).
  defaultRosterGroupIds?: string[];
  // Optional — propagates a leave type created via the inline "+ Add" button
  // back up so the caller's own list (e.g. LeavePolicySettingsPage's table)
  // stays in sync too, not just this form's local dropdown.
  onLeaveTypeCreated?: (leaveType: LeaveType) => void;
  onClose: () => void;
  onSaved: () => void;
}

const ACCRUAL_OPTIONS = [
  { value: 'yearly', label: 'Yearly — full quota available immediately' },
  { value: 'monthly', label: 'Monthly — quota accrues 1/12th each month' },
  { value: 'monthly_reset', label: 'Monthly reset — use-it-or-lose-it each month' },
];

export function LeavePolicyFormModal({
  policy,
  leaveTypes,
  defaultRosterGroupIds,
  onLeaveTypeCreated,
  onClose,
  onSaved,
}: LeavePolicyFormModalProps) {
  const { hasPermission } = useAuth();
  const canCreateLeaveType = hasPermission('leave_type:create');
  const isEdit = !!policy;
  const [localLeaveTypes, setLocalLeaveTypes] = useState(leaveTypes);
  const [leaveTypeId, setLeaveTypeId] = useState(policy?.leaveTypeId ?? leaveTypes[0]?.id ?? '');
  const [annualQuota, setAnnualQuota] = useState(policy ? String(policy.annualQuota) : '');
  const [accrual, setAccrual] = useState<LeavePolicy['accrual']>(policy?.accrual ?? 'yearly');
  const [applicableAfterDays, setApplicableAfterDays] = useState(
    policy ? String(policy.applicableAfterDays) : '0'
  );
  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);
  const [rosterGroupIds, setRosterGroupIds] = useState<string[]>(
    policy?.rosterGroups?.map((rg) => rg.id) ?? defaultRosterGroupIds ?? []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingLeaveType, setIsAddingLeaveType] = useState(false);

  function handleLeaveTypeCreated(leaveType: LeaveType) {
    setLocalLeaveTypes((prev) => [...prev, leaveType]);
    selectLeaveType(leaveType.id, leaveType.defaultAccrual);
    onLeaveTypeCreated?.(leaveType);
  }

  // Pre-fills Accrual from the selected type's own default (a pure
  // suggestion, still fully editable below) — only on create, and only when
  // the type actually has one set.
  function selectLeaveType(id: string, defaultAccrual: LeaveType['defaultAccrual'] | undefined) {
    setLeaveTypeId(id);
    if (!isEdit && defaultAccrual) setAccrual(defaultAccrual);
  }

  useEffect(() => {
    listRosterGroups()
      .then(setRosterGroups)
      .catch(() => setRosterGroups([]));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isEdit) {
        await updateLeavePolicy(policy.id, {
          annualQuota: Number(annualQuota),
          accrual,
          applicableAfterDays: Number(applicableAfterDays) || 0,
          rosterGroupIds,
        });
      } else {
        await createLeavePolicy({
          leaveTypeId,
          rosterGroupIds,
          annualQuota: Number(annualQuota),
          accrual,
          applicableAfterDays: Number(applicableAfterDays) || 0,
        });
      }
      onSaved();
      onClose();
    } catch {
      setError(
        `Could not ${isEdit ? 'update' : 'create'} this leave policy — a ${
          rosterGroupIds.length > 0 ? 'policy for this leave type and Roster' : 'company-wide policy for this leave type'
        } may already exist.`
      );
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <Modal title={isEdit ? 'Edit Leave Policy' : 'Add Leave Policy'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="leave-policy-type" className="text-sm font-medium text-ink">
              Leave Type
            </label>
            {!isEdit && canCreateLeaveType && (
              <button
                type="button"
                onClick={() => setIsAddingLeaveType(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Add Leave Type
              </button>
            )}
          </div>
          <Select
            id="leave-policy-type"
            required
            disabled={isEdit}
            value={leaveTypeId}
            onChange={(event) =>
              selectLeaveType(
                event.target.value,
                localLeaveTypes.find((lt) => lt.id === event.target.value)?.defaultAccrual
              )
            }
            placeholder={localLeaveTypes.length === 0 ? 'No leave types available' : 'Select a leave type'}
            options={localLeaveTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
          />
        </div>
        <Input
          id="leave-policy-quota"
          label="Annual Quota (days)"
          type="number"
          min="0"
          step="0.5"
          required
          value={annualQuota}
          onChange={(event) => setAnnualQuota(event.target.value)}
        />
        <Select
          id="leave-policy-accrual"
          label="Accrual"
          value={accrual}
          onChange={(event) => setAccrual(event.target.value as LeavePolicy['accrual'])}
          options={ACCRUAL_OPTIONS}
        />
        <Input
          id="leave-policy-eligibility"
          label="Applicable After (days from joining)"
          type="number"
          min="0"
          value={applicableAfterDays}
          onChange={(event) => setApplicableAfterDays(event.target.value)}
        />
        <RosterMultiSelect rosterGroups={rosterGroups} selectedIds={rosterGroupIds} onChange={setRosterGroupIds} />
        <p className="-mt-2 text-xs text-ink-muted">
          Only the Roster(s) checked here will have this leave type available at all — leaving this
          unchecked means no employee gets it through this policy.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!leaveTypeId}>
            {isEdit ? 'Save Changes' : 'Add Policy'}
          </Button>
        </div>
      </form>
    </Modal>

    {isAddingLeaveType && (
      <LeaveTypeFormModal onClose={() => setIsAddingLeaveType(false)} onSaved={handleLeaveTypeCreated} />
    )}
    </>
  );
}
