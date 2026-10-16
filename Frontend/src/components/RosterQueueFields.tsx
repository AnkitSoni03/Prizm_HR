import { useEffect, useState } from 'react';
import { Select } from './ui/Select';
import { useAuth } from '../context/auth-context';
import { getYearlyCycle } from '../api/companyAdmin/leavePolicies';
import { YEARLY_CYCLE_OPTIONS, addDaysToDate, yearlyCycleLabel } from '../utils/yearlyCycle';
import { formatDisplayDate } from '../utils/dateDisplay';

interface RosterQueueFieldsProps {
  idPrefix: string;
  rosterGroups: { id: string; name: string }[];
  currentRosterGroupId: string;
  // Only Probation/Intern employees get a queued Roster.
  showNextRoster: boolean;
  nextRosterGroupId: string;
  onNextRosterChange: (id: string) => void;
  // Last day of the Probation/Intern period, if known.
  endDate: string | null;
  // '' = the company's default cycle.
  yearlyCycleStartMonth: string;
  onYearlyCycleChange: (month: string) => void;
  disabled?: boolean;
}

// "Roster after Probation / Intern" (the queue) + "Yearly Roster Update",
// shared by the Add and Edit Employee forms. See
// Backend/src/modules/org/probationConversion.service.js and
// Backend/src/utils/leavePeriod.js.
export function RosterQueueFields({
  idPrefix,
  rosterGroups,
  currentRosterGroupId,
  showNextRoster,
  nextRosterGroupId,
  onNextRosterChange,
  endDate,
  yearlyCycleStartMonth,
  onYearlyCycleChange,
  disabled,
}: RosterQueueFieldsProps) {
  const { hasPermission } = useAuth();
  const [companyCycle, setCompanyCycle] = useState<number | null>(null);
  const canReadCycle = hasPermission('leave_policy:read');

  useEffect(() => {
    if (!canReadCycle) return;
    getYearlyCycle()
      .then((res) => setCompanyCycle(res.yearlyCycleStartMonth))
      .catch(() => setCompanyCycle(null));
  }, [canReadCycle]);

  const nextRosterName = rosterGroups.find((rg) => rg.id === nextRosterGroupId)?.name;
  let queueHint = 'Leave empty to keep them on their current roster and type when the period ends.';
  if (nextRosterGroupId && endDate) {
    queueHint = `From ${formatDisplayDate(addDaysToDate(endDate, 1))} they become Full-time on "${nextRosterName}", with leaves carried forward up to each leave type's limit.`;
  } else if (nextRosterGroupId) {
    queueHint = `They become Full-time on "${nextRosterName}" the day after the period ends (set the period above).`;
  }

  return (
    <>
      {showNextRoster && (
        <div>
          <Select
            id={`${idPrefix}-next-roster`}
            label="Roster after Probation / Intern (optional)"
            value={nextRosterGroupId}
            onChange={(event) => onNextRosterChange(event.target.value)}
            placeholder="None — stay on the current roster"
            options={rosterGroups
              .filter((rg) => rg.id !== currentRosterGroupId)
              .map((rg) => ({ value: rg.id, label: rg.name }))}
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-ink-muted">{queueHint}</p>
        </div>
      )}
      <div>
        <Select
          id={`${idPrefix}-yearly-cycle`}
          label="Yearly Roster Update"
          value={yearlyCycleStartMonth}
          onChange={(event) => onYearlyCycleChange(event.target.value)}
          placeholder={companyCycle ? `Company default (${yearlyCycleLabel(companyCycle)})` : 'Company default'}
          options={YEARLY_CYCLE_OPTIONS}
          disabled={disabled}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Leaves renew every year from this month, carrying forward up to each leave type's limit. Not
          during a Probation / Intern period — the first renewal comes after it ends.
        </p>
      </div>
    </>
  );
}
