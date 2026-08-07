import { useEffect, useState } from 'react';
import { ShieldAlert, Video, CheckCircle2 } from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useToast } from '../../context/toast-context';
import {
  listFaceFlags,
  getFaceFlagVideoUrl,
  markFaceFlagReviewed,
  type FaceVerificationFlag,
} from '../../api/companyAdmin/faceFlags';

const LIMIT = 20;

const REASON_LABEL: Record<FaceVerificationFlag['reason'], string> = {
  anti_spoof_model: 'Photo/Video/Screen Detected',
  screen_artifact: 'Possible Screen (unconfirmed)',
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatScore(flag: FaceVerificationFlag): string {
  if (flag.reason === 'anti_spoof_model' && flag.antiSpoofConfidence !== null) {
    return flag.antiSpoofConfidence.toFixed(2);
  }
  if (flag.reason === 'screen_artifact' && flag.screenArtifactScore !== null) {
    return flag.screenArtifactScore.toFixed(2);
  }
  return '—';
}

// Company Admin's view into every kiosk face-attendance attempt the
// anti-spoof model or screen-artifact heuristic flagged as suspicious —
// the "admin can check if there's doubt" review surface, per the explicit
// ask alongside the anti-spoof model itself. A "Blocked" row was actually
// rejected (companies.face_antispoof_enforced was on) and has its own
// capture clip here; a non-blocked row went through as a normal attendance
// punch (shadow mode, or a screen-artifact-only soft flag) — its clip
// lives on that attendance record instead, reachable from Attendance
// Records, not duplicated here.
export function FraudAttemptsPage() {
  const showToast = useToast();
  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const [flags, setFlags] = useState<FaceVerificationFlag[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listFaceFlags({
        reviewed: unreviewedOnly ? false : undefined,
        limit: LIMIT,
        offset,
      });
      setFlags(result.data);
      setTotal(result.pagination.total);
    } catch {
      setError('Could not load flagged attempts.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreviewedOnly, offset]);

  async function openVideo(id: string) {
    setVideoError(null);
    try {
      const url = await getFaceFlagVideoUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setVideoError('Could not open this video. It may not have finished uploading yet, or has expired.');
    }
  }

  async function markReviewed(id: string) {
    try {
      await markFaceFlagReviewed(id);
      showToast('Marked as reviewed.', 'success');
      load();
    } catch {
      showToast('Could not mark this attempt as reviewed.', 'error');
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Kiosk check-in/out attempts flagged by the face anti-spoof check as a possible photo, video, or screen —
          not a live person.
        </p>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary"
            checked={unreviewedOnly}
            onChange={(event) => {
              setOffset(0);
              setUnreviewedOnly(event.target.checked);
            }}
          />
          Unreviewed only
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {videoError && <p className="mb-3 text-sm text-danger">{videoError}</p>}

      {!isLoading && !error && flags.length === 0 && (
        <EmptyStateCard
          icon={ShieldAlert}
          title="No flagged attempts"
          description={unreviewedOnly ? 'Nothing waiting on review.' : 'No suspicious kiosk attempts recorded yet.'}
        />
      )}

      {(isLoading || flags.length > 0) && (
        <>
          <Table
            isLoading={isLoading}
            rows={flags}
            rowKey={(f) => f.id}
            columns={[
              { key: 'when', header: 'When', render: (f) => formatDateTime(f.createdAt) },
              { key: 'action', header: 'Action', render: (f) => (f.action === 'checkin' ? 'Check In' : 'Check Out') },
              {
                key: 'employee',
                header: 'Claimed Identity',
                render: (f) => f.employee?.name ?? f.employee?.employeeCode ?? 'Unmatched',
              },
              {
                key: 'reason',
                header: 'Reason',
                render: (f) => (
                  <Badge tone={f.reason === 'anti_spoof_model' ? 'danger' : 'warning'}>{REASON_LABEL[f.reason]}</Badge>
                ),
              },
              { key: 'score', header: 'Score', render: (f) => formatScore(f) },
              {
                key: 'blocked',
                header: 'Outcome',
                render: (f) => <Badge tone={f.blocked ? 'danger' : 'warning'}>{f.blocked ? 'Blocked' : 'Allowed through'}</Badge>,
              },
              {
                key: 'video',
                header: 'Video',
                className: 'w-16',
                render: (f) =>
                  f.blocked ? (
                    <button
                      type="button"
                      onClick={() => openVideo(f.id)}
                      aria-label="View capture clip"
                      title="View capture clip"
                      className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-primary"
                    >
                      <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  ) : (
                    <span className="text-xs text-ink-muted">See attendance</span>
                  ),
              },
              {
                key: 'reviewed',
                header: '',
                className: 'w-32',
                render: (f) =>
                  f.reviewed ? (
                    <span className="flex items-center gap-1 text-xs text-ink-muted">
                      <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Reviewed
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markReviewed(f.id)}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary"
                    >
                      Mark Reviewed
                    </button>
                  ),
              },
            ]}
          />
          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}
    </div>
  );
}
