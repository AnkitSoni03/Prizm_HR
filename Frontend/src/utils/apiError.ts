// The server's own `{ error }` message from a failed API call, else
// `fallback` — so an approve/reject/revert failure tells the user why
// (e.g. "Payroll ... already processed") instead of silently doing nothing.
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof message === 'string' && message ? message : fallback;
}
