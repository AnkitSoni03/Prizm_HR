import { Input } from './ui/Input';
import { formatDisplayDate } from '../utils/dateDisplay';
import { probationEndDate } from '../utils/probation';

interface ProbationPeriodFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  dateOfJoining: string;
  employmentType: string;
  disabled?: boolean;
}

// Optional "Probation / Intern Period (days)" input used by both the Add and
// Edit Employee forms. Shows the resulting last day (DOJ = day 1) as a hint,
// and notes when reminders won't run because the Employment Type isn't
// Probation/Intern (that's what ends tracking — see utils/probation.js on
// the backend).
export function ProbationPeriodField({
  id,
  value,
  onChange,
  dateOfJoining,
  employmentType,
  disabled,
}: ProbationPeriodFieldProps) {
  const endDate = probationEndDate(dateOfJoining, value);
  const tracked = employmentType === 'probation' || employmentType === 'intern';

  let hint: string | null = null;
  if (value && !endDate) hint = dateOfJoining ? 'Enter whole days, e.g. 180.' : 'Set the Date of Joining to see the end date.';
  else if (endDate && tracked) hint = `Ends on ${formatDisplayDate(endDate)}. Reminders start 3 days before.`;
  else if (endDate) hint = `Ends on ${formatDisplayDate(endDate)}. No reminders while Employment Type isn't Probation or Intern.`;

  return (
    <div>
      <Input
        id={id}
        label="Probation / Intern Period (days, optional)"
        type="number"
        min={1}
        max={3650}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. 180"
        disabled={disabled}
      />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
