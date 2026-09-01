import { useEffect, type ComponentType, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Gauge,
  LogIn,
  LogOut,
  Monitor,
  ShieldAlert,
  ShieldOff,
  Video,
} from 'lucide-react';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { DetailRow } from '../../components/ui/DetailRow';
import { Skeleton } from '../../components/ui/Skeleton';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import { useToast } from '../../context/toast-context';
import {
  listFaceFlags,
  getFaceFlagVideoUrl,
  markFaceFlagReviewed,
  type FaceVerificationFlag,
} from '../../api/companyAdmin/faceFlags';
import { getAttendanceVideoUrl } from '../../api/companyAdmin/attendanceRecords';

const LIMIT = 20;

const REASON_LABEL: Record<FaceVerificationFlag['reason'], string> = {
  anti_spoof_model: 'Photo/Video/Screen Detected',
  screen_artifact: 'Possible Screen (unconfirmed)',
};

const REASON_ICON: Record<FaceVerificationFlag['reason'], ComponentType<{ className?: string; strokeWidth?: number }>> = {
  anti_spoof_model: Camera,
  screen_artifact: Monitor,
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

// A non-blocked attempt (shadow mode, or a screen-artifact-only soft flag)
// still has a real capture clip — it just lives on the Attendance row the
// punch produced instead of a second copy on the flag itself (see
// faceFlag.service.js::uploadFlagCapture). Either way there's something to
// watch, which is the whole point of a fraud-review page.
function hasVideo(flag: FaceVerificationFlag): boolean {
  return flag.blocked || !!flag.attendanceId;
}

function ReasonBadge({ reason }: { reason: FaceVerificationFlag['reason'] }) {
  const Icon = REASON_ICON[reason];
  return (
    <Badge tone={reason === 'anti_spoof_model' ? 'danger' : 'warning'}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        {REASON_LABEL[reason]}
      </span>
    </Badge>
  );
}

function OutcomeBadge({ blocked }: { blocked: boolean }) {
  const Icon = blocked ? ShieldOff : AlertTriangle;
  return (
    <Badge tone={blocked ? 'danger' : 'warning'}>
      <span className="inline-flex items-center gap-1">
        <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
        {blocked ? 'Blocked' : 'Allowed Through'}
      </span>
    </Badge>
  );
}

function FraudCardSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
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

interface FraudCardProps {
  flag: FaceVerificationFlag;
  onOpenVideo: () => void;
  onMarkReviewed: () => void;
}

function FraudCard({ flag, onOpenVideo, onMarkReviewed }: FraudCardProps) {
  const name = flag.employee?.name ?? flag.employee?.employeeCode ?? 'Unmatched';
  const videoAvailable = hasVideo(flag);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={flag.employee?.photoDownloadUrl} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{formatDateTime(flag.createdAt)}</p>
          </div>
        </div>
        <div className="shrink-0">
          <OutcomeBadge blocked={flag.blocked} />
        </div>
      </div>

      <div className="mt-3.5 space-y-2.5 border-t border-border pt-3.5">
        <DetailRow
          icon={flag.action === 'checkin' ? LogIn : LogOut}
          label="Action"
          value={flag.action === 'checkin' ? 'Check In' : 'Check Out'}
        />
        <DetailRow icon={REASON_ICON[flag.reason]} label="Reason" value={<ReasonBadge reason={flag.reason} />} />
        <DetailRow icon={Gauge} label="Score" value={formatScore(flag)} />
      </div>

      <div className="mt-3.5 flex items-center gap-1 border-t border-border pt-3">
        <button
          type="button"
          onClick={onOpenVideo}
          disabled={!videoAvailable}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent"
        >
          <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
          {videoAvailable ? 'View Video' : 'No Video'}
        </button>
        {flag.reviewed ? (
          <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-ink-muted">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reviewed
          </span>
        ) : (
          <button
            type="button"
            onClick={onMarkReviewed}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/10"
          >
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Mark Reviewed
          </button>
        )}
      </div>
    </div>
  );
}

// Company Admin's view into every kiosk face-attendance attempt the
// anti-spoof model or screen-artifact heuristic flagged as suspicious —
// the "admin can check if there's doubt" review surface, per the explicit
// ask alongside the anti-spoof model itself. A "Blocked" row was actually
// rejected (companies.face_antispoof_enforced was on) and has its own
// capture clip here; a non-blocked row went through as a normal attendance
// punch (shadow mode, or a screen-artifact-only soft flag) — its clip
// lives on that attendance record instead, fetched via the same
// getAttendanceVideoUrl AttendanceRecordsPage.tsx uses (both are gated by
// the same attendance:read permission this page's own nav entry requires).
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

  async function openVideo(flag: FaceVerificationFlag) {
    setVideoError(null);
    try {
      const url = flag.blocked
        ? await getFaceFlagVideoUrl(flag.id)
        : flag.attendanceId
          ? await getAttendanceVideoUrl(flag.attendanceId, flag.action)
          : null;
      if (!url) {
        setVideoError('No video was recorded for this attempt.');
        return;
      }
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
      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <ShieldAlert className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-sm text-ink-muted">
            Kiosk check-in/out attempts flagged by the face anti-spoof check as a possible photo, video, or screen —
            not a live person.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink">
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
          <div className="hidden md:block">
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
                  render: (f) => (
                    <div className="flex items-center gap-2.5">
                      <Avatar src={f.employee?.photoDownloadUrl} size="sm" />
                      <span>{f.employee?.name ?? f.employee?.employeeCode ?? 'Unmatched'}</span>
                    </div>
                  ),
                },
                { key: 'reason', header: 'Reason', render: (f) => <ReasonBadge reason={f.reason} /> },
                { key: 'score', header: 'Score', render: (f) => formatScore(f) },
                { key: 'blocked', header: 'Outcome', render: (f) => <OutcomeBadge blocked={f.blocked} /> },
                {
                  key: 'video',
                  header: 'Video',
                  className: 'w-16',
                  render: (f) =>
                    hasVideo(f) ? (
                      <button
                        type="button"
                        onClick={() => openVideo(f)}
                        aria-label="View capture clip"
                        title="View capture clip"
                        className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-primary"
                      >
                        <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:hidden lg:grid-cols-3">
            {isLoading && <FraudCardSkeleton />}
            {!isLoading &&
              flags.map((f) => (
                <FraudCard key={f.id} flag={f} onOpenVideo={() => openVideo(f)} onMarkReviewed={() => markReviewed(f.id)} />
              ))}
          </div>

          <Pagination total={total} limit={LIMIT} offset={offset} onOffsetChange={setOffset} />
        </>
      )}
    </div>
  );
}
