import { useState } from 'react';
import axios from 'axios';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { changeEmployeeRoster, type RosterTransferDetail } from '../api/companyAdmin/employees';
import type { RosterPolicyGroup } from '../api/companyAdmin/rosterGroups';

interface ChangeRosterModalProps {
  employeeId: string;
  currentRosterGroupId: string | null;
  rosterGroups: RosterPolicyGroup[];
  onClose: () => void;
  onChanged: (details: RosterTransferDetail[]) => void;
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

// A Roster governs which Leave Policy applies per leave type
// (RosterGroupLeavePolicy) — switching an employee's Roster can leave real,
// already-credited leave balance behind. This is the only place that action
// happens from (see rosterTransfer.service.js) — the plain employee edit
// form no longer touches rosterGroupId at all, precisely so this decision
// can never be skipped.
export function ChangeRosterModal({
  employeeId,
  currentRosterGroupId,
  rosterGroups,
  onClose,
  onChanged,
}: ChangeRosterModalProps) {
  const [selectedId, setSelectedId] = useState(currentRosterGroupId ?? '');
  const [carryForward, setCarryForward] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRealChange = selectedId !== (currentRosterGroupId ?? '');
  // Only an actual old-Roster -> new-Roster switch has any existing leave
  // balance to make a carry-forward decision about — a first-time
  // assignment (no current Roster) has nothing to carry or reset.
  const needsCarryForwardChoice = isRealChange && !!currentRosterGroupId;
  const canSubmit = isRealChange && (!needsCarryForwardChoice || carryForward !== null);

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await changeEmployeeRoster(employeeId, {
        rosterGroupId: selectedId || null,
        carryForward: needsCarryForwardChoice ? !!carryForward : false,
      });
      onChanged(result.details);
    } catch (err) {
      setError(extractError(err, 'Could not change this Roster. Please try again.'));
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Change Roster" onClose={onClose} widthClassName="max-w-sm" compact>
      <div className="space-y-4">
        <Select
          id="change-roster-select"
          label="New Roster"
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setCarryForward(null);
          }}
          placeholder="None — company/brand-wide defaults"
          options={rosterGroups.map((rg) => ({ value: rg.id, label: rg.name }))}
        />

        {needsCarryForwardChoice && (
          <div className="space-y-2 rounded-lg border border-border bg-page p-3">
            <p className="text-sm font-medium text-ink">Carry forward existing leave balances?</p>
            <p className="text-xs text-ink-muted">
              This employee may already have unused leave balance credited under their current Roster.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={carryForward === true ? 'primary' : 'secondary'}
                onClick={() => setCarryForward(true)}
              >
                Yes, carry forward
              </Button>
              <Button
                type="button"
                variant={carryForward === false ? 'primary' : 'secondary'}
                onClick={() => setCarryForward(false)}
              >
                No, start fresh
              </Button>
            </div>
            {carryForward === true && (
              <p className="text-xs text-ink-muted">
                A leave type the new Roster also grants keeps its balance exactly as-is. A leave type only the
                old Roster granted has its remaining balance (capped per that leave type's own carry-forward
                rule, if set) moved into a new "Carry Forward" leave type instead of being lost.
              </p>
            )}
            {carryForward === false && (
              <p className="text-xs text-ink-muted">
                Every leave balance this employee had under the old Roster is recalculated fresh from the new
                Roster's own policy — nothing carries over.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} isLoading={isSubmitting} disabled={!canSubmit}>
            Change Roster
          </Button>
        </div>
      </div>
    </Modal>
  );
}
