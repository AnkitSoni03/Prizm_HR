// Mirrors Backend/src/utils/shiftTime.js: a shift whose end time is at or
// before its start time (e.g. 21:00–06:00) ends on the next calendar day.
export function crossesMidnight(startTime: string | null | undefined, endTime: string | null | undefined): boolean {
  if (!startTime || !endTime) return false;
  return endTime.slice(0, 5) <= startTime.slice(0, 5);
}

export function isOvernightShift(shift: { isNightShift: boolean; startTime: string; endTime: string }): boolean {
  return shift.isNightShift || crossesMidnight(shift.startTime, shift.endTime);
}
