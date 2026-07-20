// Backend date-only fields come back as plain "YYYY-MM-DD" strings (see
// dateRange.js's local Y-M-D convention) — parsed directly rather than via
// `new Date(str)`, which would interpret them as UTC midnight and can roll
// back a day once rendered in a local timezone ahead of UTC (e.g. IST).
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const datePart = value.length > 10 ? value.slice(0, 10) : value;
  const [year, month, day] = datePart.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}
