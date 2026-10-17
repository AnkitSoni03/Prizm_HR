// Working hours as computed by the backend (attendance.service.js::workedMinutesFor):
// 'actual' = between the real punches; 'shift' = the assigned shift's length,
// for an On Duty day or a missed checkout (punch times are never filled in).
export type WorkedMinutesBasis = 'actual' | 'shift' | null;

export interface WorkedHoursFields {
  workedMinutes?: number | null;
  workedMinutesBasis?: WorkedMinutesBasis;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

// "8h 30m", "9h 00m (shift)" or "—".
export function workingHoursLabel(record: WorkedHoursFields): string {
  if (record.workedMinutes == null) return '—';
  const text = formatDuration(record.workedMinutes);
  return record.workedMinutesBasis === 'shift' ? `${text} (shift)` : text;
}
