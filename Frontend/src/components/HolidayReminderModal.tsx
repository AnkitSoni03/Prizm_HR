import { useEffect, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useAuth } from '../context/auth-context';
import { listHolidays, type Holiday } from '../api/companyAdmin/holidays';
import { formatDisplayDate } from '../utils/dateDisplay';

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dismissedKey(holidayId: string): string {
  return `hrms:holidayReminderDismissed:${holidayId}`;
}

// Mounted once in Layout (portal-agnostic, same as NotificationBell) so
// every portal gets it. Backs up the bell notification with something an
// employee can't miss just by not opening the bell — pops up once per
// holiday *occurrence* (tracked by holiday id, not by calendar day) whenever
// tomorrow is a holiday, so reopening the app the same day never re-shows a
// dismissed one, but a different holiday due the next day still will.
export function HolidayReminderModal() {
  const { user, hasPermission } = useAuth();
  const [holiday, setHoliday] = useState<Holiday | null>(null);

  useEffect(() => {
    // holiday:read is a company-scoped permission — Super Admin (no company
    // of their own) never holds it, which also sidesteps the tenant-scope
    // hook's null-company-context gotcha (see CLAUDE.md) rather than having
    // to special-case it here.
    if (!user || !hasPermission('holiday:read')) return;

    const tomorrow = tomorrowStr();
    listHolidays({ from: tomorrow, to: tomorrow })
      .then((result) => {
        const upcoming = result.data[0];
        if (upcoming && localStorage.getItem(dismissedKey(upcoming.id)) !== '1') {
          setHoliday(upcoming);
        }
      })
      .catch(() => {
        /* non-critical — the bell notification still covers this */
      });
    // Deliberately only re-checks when the signed-in user changes (fresh
    // login/app load), not on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!holiday) return null;

  function handleDismiss() {
    localStorage.setItem(dismissedKey(holiday!.id), '1');
    setHoliday(null);
  }

  return (
    <Modal title="Holiday Reminder" onClose={handleDismiss} widthClassName="max-w-sm">
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
          <PartyPopper className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-lg font-semibold text-ink">{holiday.name}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDisplayDate(holiday.date)} is {holiday.type === 'optional' ? 'an optional' : 'a'} holiday — enjoy
            your day off!
          </p>
        </div>
        <Button type="button" onClick={handleDismiss} className="w-full">
          Got it
        </Button>
      </div>
    </Modal>
  );
}
