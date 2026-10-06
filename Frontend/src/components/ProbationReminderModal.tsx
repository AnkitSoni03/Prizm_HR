import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Hourglass } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { useAuth } from '../context/auth-context';
import { listProbationAlerts, type ProbationAlert } from '../api/probation';
import { formatDisplayDate } from '../utils/dateDisplay';
import { describeRemaining, periodLabel, PROBATION_POPUP_KEY_PREFIX } from '../utils/probation';

// Where an admin goes to change the Employment Type, per portal.
function employeesPathFor(pathname: string): string | null {
  if (pathname.startsWith('/company-admin')) return '/company-admin/employees';
  if (pathname.startsWith('/brand-admin')) return '/brand-admin/employees';
  if (pathname.startsWith('/ess')) return '/ess/employees';
  return null;
}

// Mounted once in Layout (like HolidayReminderModal). After login, lists
// every Probation/Intern period ending within 3 days or already ended that
// this user should know about — their own, ones they can edit, their team's
// (GET /employees/probation-alerts). Keeps coming back each login until the
// Employment Type is changed (normally to Full-time), which drops the
// employee from the list.
export function ProbationReminderModal() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [alerts, setAlerts] = useState<ProbationAlert[]>([]);

  useEffect(() => {
    if (!user) return;
    const key = `${PROBATION_POPUP_KEY_PREFIX}${user.id}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
    } catch {
      /* storage unavailable — just show it */
    }
    listProbationAlerts()
      .then(setAlerts)
      .catch(() => {
        /* non-critical — the daily bell notification still covers this */
      });
    // Only on a fresh login/app load, not every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user || alerts.length === 0) return null;

  function handleDismiss() {
    try {
      sessionStorage.setItem(`${PROBATION_POPUP_KEY_PREFIX}${user!.id}`, '1');
    } catch {
      /* ignore */
    }
    setAlerts([]);
  }

  const self = alerts.find((alert) => alert.relation === 'self');
  const others = alerts.filter((alert) => alert.relation !== 'self');
  const employeesPath = employeesPathFor(location.pathname);
  const canOpenEmployees =
    !!employeesPath && others.some((alert) => alert.relation === 'admin') && hasPermission('employee:update');

  return (
    <Modal title="Probation / Internship Reminder" onClose={handleDismiss} widthClassName="max-w-lg" compact>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
            <Hourglass className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <p className="text-sm text-ink-muted">
            {others.length > 0
              ? "These periods are ending or have ended. Review each employee and change their Employment Type to Full-time once confirmed — you'll keep getting this reminder until then."
              : 'Your period is coming to an end. Your manager and HR will review and confirm your employment status.'}
          </p>
        </div>

        {self && (
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Your {periodLabel(self.employmentType).toLowerCase()}</p>
              <Badge tone={self.daysRemaining < 0 ? 'danger' : 'warning'}>{describeRemaining(self.daysRemaining)}</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-muted">Last day: {formatDisplayDate(self.endDate)}</p>
          </div>
        )}

        {others.length > 0 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {others.map((alert) => (
              <li key={alert.employeeId} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink">
                    {[alert.name, alert.employeeCode].filter(Boolean).join(' · ')}
                  </p>
                  <Badge tone={alert.daysRemaining < 0 ? 'danger' : 'warning'}>
                    {describeRemaining(alert.daysRemaining)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {periodLabel(alert.employmentType)} · last day {formatDisplayDate(alert.endDate)}
                  {(alert.companyName || alert.brandName) &&
                    ` · ${[alert.companyName, alert.brandName].filter(Boolean).join(' › ')}`}
                  {alert.relation === 'team' && ' · your team'}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          {canOpenEmployees && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                handleDismiss();
                navigate(employeesPath!);
              }}
            >
              Go to Employees
            </Button>
          )}
          <Button type="button" onClick={handleDismiss}>
            Got it
          </Button>
        </div>
      </div>
    </Modal>
  );
}
