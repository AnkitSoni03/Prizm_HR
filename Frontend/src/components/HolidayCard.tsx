import { CalendarClock, CalendarRange, History, Layers, Pencil, Trash2 } from 'lucide-react';
import { ColorTag, AccentTag } from './ColorTag';
import { DetailRow } from './ui/DetailRow';
import { Skeleton } from './ui/Skeleton';
import { holidayAuditName, type Holiday } from '../api/companyAdmin/holidays';
import { countDaysInclusive, formatDisplayDateRange } from '../utils/dateDisplay';

interface HolidayCardProps {
  holiday: Holiday;
  // "Applies To" (which Rosters see it) is a Company/Brand Admin concern
  // only — the ESS page never shows it, even to an employee holding the
  // manage powers below.
  showAppliesTo?: boolean;
  // "Record" (created/last-edited by) mirrors the desktop Table's own
  // canManage gate on ESS's page — an employee with no manage powers there
  // sees neither this nor the Edit/Delete actions. Company Admin's page
  // never gates it, so it just omits this prop (stays true).
  showRecord?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

// Mobile-first card for one holiday — the same fields the desktop Table's
// columns show as label/value rows, in the icon-avatar + detail-rows +
// Edit/Delete-footer shape shared by every other card-style list page in
// this app (Organization's Brands, Shifts, Roster, Attendance Records).
export function HolidayCard({ holiday, showAppliesTo = false, showRecord = true, onEdit, onDelete }: HolidayCardProps) {
  const count = countDaysInclusive(holiday.date, holiday.endDate);
  const createdByName = holidayAuditName(holiday.creator);
  const updatedByName = holidayAuditName(holiday.updater);
  const recordLine = [createdByName && `Created by ${createdByName}`, updatedByName && `Edited by ${updatedByName}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <ColorTag>{holiday.name}</ColorTag>
          </div>
        </div>
        <div className="shrink-0">
          <AccentTag>
            {count} Day{count === 1 ? '' : 's'}
          </AccentTag>
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow icon={CalendarRange} label="Date" value={formatDisplayDateRange(holiday.date, holiday.endDate)} />
        {showAppliesTo && (
          <DetailRow
            icon={Layers}
            label="Applies To"
            value={
              holiday.rosterGroups && holiday.rosterGroups.length > 0
                ? holiday.rosterGroups.map((rg) => rg.name).join(', ')
                : 'Not visible to anyone yet'
            }
          />
        )}
        {showRecord && recordLine && (
          <DetailRow icon={History} label="Record" value={<span className="text-xs">{recordLine}</span>} />
        )}
      </div>

      {(onEdit || onDelete) && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-border pt-3">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${holiday.name}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-page hover:text-ink"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${holiday.name}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function HolidayCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </>
  );
}
