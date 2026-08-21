import { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useAuth } from '../../context/auth-context';
import { listMyCompOffCredits, type CompOffCredit } from '../../api/ess/compOff';
import { createLeaveRequest, listLeaveTypes, type LeaveType } from '../../api/ess/leave';
import { formatDisplayDate, daysUntil } from '../../utils/dateDisplay';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  expired: 'neutral',
  used: 'neutral',
};

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function MyCompOffPage() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CompOffCredit[]>([]);
  const [coLeaveType, setCoLeaveType] = useState<LeaveType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [date, setDate] = useState(formatDate(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [creditsResult, types] = await Promise.all([listMyCompOffCredits({ limit: 100 }), listLeaveTypes()]);
      setCredits(creditsResult.data);
      setCoLeaveType(types.find((t) => t.code === 'CO') ?? null);
    } catch {
      setError('Could not load your comp-off credits.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const today = formatDate(new Date());
  // Null expiryDate means "earned under a carry-forward policy — never
  // expires", so it can't be excluded by a plain >= today comparison.
  const availableCount = credits.filter(
    (c) => c.status === 'approved' && (c.expiryDate === null || c.expiryDate >= today)
  ).length;
  // Nudges the employee to actually spend a credit before it's wasted —
  // same 14-day threshold and "unused only" rule as the Expires column's
  // per-row badge below.
  const expiringSoonCount = credits.filter(
    (c) => c.status === 'approved' && c.expiryDate !== null && daysUntil(c.expiryDate) >= 0 && daysUntil(c.expiryDate) <= 14
  ).length;

  function openModal() {
    setDate(formatDate(new Date()));
    setSubmitError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    if (!coLeaveType) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await createLeaveRequest({ leaveTypeId: coLeaveType.id, fromDate: date, toDate: date });
      setIsModalOpen(false);
      load();
    } catch (err) {
      setSubmitError(extractError(err, 'Could not use a comp-off credit for that date. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  // No Comp-Off Policy assigned (the default — comp-off is opt-in, per the
  // Comp Off Setting page) — show nothing about the feature at all, rather
  // than an empty "0 credits" table that implies they could have some.
  if (user && !user.compOffEnrolled) {
    return (
      <EmptyStateCard
        icon={RefreshCw}
        title="Comp-Off isn't enabled for you"
        description="You haven't been enrolled in the Comp-Off benefit yet. Ask your HR admin to assign you a Comp-Off Policy to start earning credit for working a holiday or week-off."
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
        <p className="text-xs text-ink-muted sm:text-sm">
          You have <span className="font-semibold text-ink">{availableCount}</span> comp-off{' '}
          {availableCount === 1 ? 'credit' : 'credits'} ready to use.
        </p>
        <Button
          onClick={openModal}
          disabled={!coLeaveType || availableCount === 0}
          className="!px-3 !py-1.5 !text-xs sm:!px-4 sm:!py-2 sm:!text-sm"
        >
          Use a comp-off credit
        </Button>
      </div>

      {expiringSoonCount > 0 && (
        <p className="mb-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning sm:mb-3 sm:text-sm">
          {expiringSoonCount} comp-off {expiringSoonCount === 1 ? 'credit is' : 'credits are'} expiring within 14
          days — use {expiringSoonCount === 1 ? 'it' : 'them'} before {expiringSoonCount === 1 ? 'it' : 'they'}{' '}
          go to waste.
        </p>
      )}

      {error && <p className="mb-2.5 text-xs text-danger sm:mb-3 sm:text-sm">{error}</p>}
      {!coLeaveType && !isLoading && !error && (
        <p className="mb-2.5 text-xs text-ink-muted sm:mb-3 sm:text-sm">
          Comp-off isn&apos;t configured as a leave type for your company yet.
        </p>
      )}

      <Table
        isLoading={isLoading}
        rows={credits}
        rowKey={(c) => c.id}
        emptyMessage="You haven't earned any comp-off credits yet."
        columns={[
          { key: 'earnedDate', header: 'Earned', render: (c) => formatDisplayDate(c.earnedDate) },
          {
            key: 'expiryDate',
            header: 'Expires',
            render: (c) => {
              const daysLeft = c.expiryDate ? daysUntil(c.expiryDate) : null;
              // Only a still-unused (approved) credit can be "wasted" — one
              // already used/rejected/expired has nothing left to warn about.
              const expiringSoon = c.status === 'approved' && daysLeft !== null && daysLeft >= 0 && daysLeft <= 14;
              return (
                <>
                  {c.expiryDate ? formatDisplayDate(c.expiryDate) : 'Never'}
                  {expiringSoon && (
                    <span className="ml-1.5">
                      <Badge tone="warning">{daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}</Badge>
                    </span>
                  )}
                </>
              );
            },
          },
          {
            key: 'status',
            header: 'Status',
            render: (c) => <Badge tone={STATUS_TONE[c.status]}>{c.status.replace('_', ' ')}</Badge>,
          },
        ]}
      />

      {isModalOpen && (
        <Modal title="Use a comp-off credit" onClose={() => setIsModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              We&apos;ll apply your oldest available comp-off credit toward this day off.
            </p>
            <Input id="comp-off-date" type="date" label="Date" value={date} onChange={(event) => setDate(event.target.value)} />
            {submitError && <p className="text-sm text-danger">{submitError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} isLoading={isSubmitting}>
                Submit request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
