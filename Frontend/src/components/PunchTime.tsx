import { formatDisplayDate } from '../utils/dateDisplay';

// A check-in/check-out instant as the time, with the actual calendar date
// it happened on underneath in small text — an overnight shift's check-out
// lands on the day after the attendance date, so the time alone is
// ambiguous.
export function PunchTime({ value }: { value: string | null | undefined }) {
  if (!value) return <span>—</span>;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return <span>—</span>;
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="text-[11px] text-ink-muted">{formatDisplayDate(localDate)}</span>
    </span>
  );
}
