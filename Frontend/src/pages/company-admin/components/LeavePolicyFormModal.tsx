import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { RosterMultiSelect } from '../../../components/ui/RosterMultiSelect';
import { createLeavePolicy, updateLeavePolicy, type LeavePolicy } from '../../../api/companyAdmin/leavePolicies';
import { listRosterGroups, type RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import type { LeaveType } from '../../../api/companyAdmin/leaveBalance';

interface LeavePolicyFormModalProps {
  policy?: LeavePolicy;
  leaveTypes: LeaveType[];
  onClose: () => void;
  onSaved: () => void;
}

const ACCRUAL_OPTIONS = [
  { value: 'yearly', label: 'Yearly — full quota available immediately' },
  { value: 'monthly', label: 'Monthly — quota accrues 1/12th each month' },
  { value: 'monthly_reset', label: 'Monthly reset — use-it-or-lose-it each month' },
];

export function LeavePolicyFormModal({ policy, leaveTypes, onClose, onSaved }: LeavePolicyFormModalProps) {
  const isEdit = !!policy;
  const [leaveTypeId, setLeaveTypeId] = useState(policy?.leaveTypeId ?? leaveTypes[0]?.id ?? '');
  const [annualQuota, setAnnualQuota] = useState(policy ? String(policy.annualQuota) : '');
  const [accrual, setAccrual] = useState<LeavePolicy['accrual']>(policy?.accrual ?? 'yearly');
  const [applicableAfterDays, setApplicableAfterDays] = useState(
    policy ? String(policy.applicableAfterDays) : '0'
  );
  const [rosterGroups, setRosterGroups] = useState<RosterPolicyGroup[]>([]);
  const [rosterGroupIds, setRosterGroupIds] = useState<string[]>(
    policy?.rosterGroups?.map((rg) => rg.id) ?? []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Modal title={isEdit ? 'Edit Leave Policy' : 'Add Leave Policy'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Select
          id="leave-policy-type"
          label="Leave Type"
          required
          disabled={isEdit}
          value={leaveTypeId}
          onChange={(event) => setLeaveTypeId(event.target.value)}
          placeholder={leaveTypes.length === 0 ? 'No leave types available' : 'Select a leave type'}
          options={leaveTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
        />
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
        <RosterMultiSelect
          label="Assign to Roster(s) — optional"
          rosterGroups={rosterGroups}
          selectedIds={rosterGroupIds}
          onChange={setRosterGroupIds}
        />
        <p className="-mt-2 text-xs text-ink-muted">
          Leave unchecked for a company-wide default. Checking one or more Rosters makes this an
          override that only applies to those Rosters' employees for this leave type.
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
  );
}
