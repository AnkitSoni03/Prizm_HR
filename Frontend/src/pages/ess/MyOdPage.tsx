import { useEffect, useState } from 'react';
import axios from 'axios';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { cancelOdRequest, createOdRequest, listMyOdRequests, type OdRequest } from '../../api/ess/od';
import { formatDisplayDate } from '../../utils/dateDisplay';

const LIMIT = 20;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
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

export function MyOdPage() {
  const [requests, setRequests] = useState<OdRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(formatDate(new Date()));
  const [toDate, setToDate] = useState(formatDate(new Date()));
  const [purpose, setPurpose] = useState('');
  const [location, setLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listMyOdRequests({ status: statusFilter || undefined, limit: LIMIT, offset });
      setRequests(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load your OD requests.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, offset]);

  function openModal() {
    setFromDate(formatDate(new Date()));
    setToDate(formatDate(new Date()));
    setPurpose('');
    setLocation('');
    setSubmitError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit() {
    if (!purpose.trim()) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await createOdRequest({ fromDate, toDate, purpose: purpose.trim(), location: location.trim() || undefined });
      setIsModalOpen(false);
      setOffset(0);
      load();
    } catch (err) {
      setSubmitError(extractError(err, 'Could not submit your OD request. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this OD request?')) return;
    await cancelOdRequest(id);
    load();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-48">
          <Select
            id="od-status-filter"
            label="Status"
            value={statusFilter}
            onChange={(event) => {
              setOffset(0);
              setStatusFilter(event.target.value);
            }}
            placeholder="All statuses"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
        <Button onClick={openModal}>Apply for on-duty</Button>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <Table
        isLoading={isLoading}
        rows={requests}
        rowKey={(r) => r.id}
        emptyMessage="You haven't applied for on-duty yet."
        columns={[
          {
            key: 'dates',
            header: 'Dates',
            render: (r) => `${formatDisplayDate(r.fromDate)} → ${formatDisplayDate(r.toDate)}`,
          },
          { key: 'purpose', header: 'Purpose', render: (r) => r.purpose },
          { key: 'location', header: 'Location', render: (r) => r.location ?? '—' },
          {
            key: 'status',
            header: 'Status',
            render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>,
          },
          {
            key: 'actions',
            header: '',
            className: 'w-28 text-right',
            render: (r) =>
              r.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleCancel(r.id)}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Cancel
                </button>
              ),
          },
        ]}
      />
      <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />

      {isModalOpen && (
        <Modal title="Apply for on-duty" onClose={() => setIsModalOpen(false)}>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  id="od-from"
                  type="date"
                  label="From"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input
                  id="od-to"
                  type="date"
                  label="To"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              </div>
            </div>
            <Input
              id="od-purpose"
              label="Purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Client visit, offsite meeting, etc."
            />
            <Input
              id="od-location"
              label="Location (optional)"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
            {submitError && <p className="text-sm text-danger">{submitError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} isLoading={isSubmitting} disabled={!purpose.trim()}>
                Submit request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
