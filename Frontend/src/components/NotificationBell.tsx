import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../api/notifications';
import { useAuth } from '../context/auth-context';
import { getDefaultRoute } from '../routes/roleRedirect';

const POLL_INTERVAL_MS = 30_000;
// Small first page so opening the dropdown feels instant — older
// notifications only load in as the user actually scrolls for them
// (loadMore below), instead of fetching everything up front.
const PAGE_SIZE = 10;
// Fetch the next page once the user scrolls within this many pixels of the
// bottom of the dropdown's scroll container.
const LOAD_MORE_THRESHOLD_PX = 60;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// A decision/expiry notification always belongs to the recipient's own
// request — regardless of which portal they're currently browsing, that
// always lives in their ESS pages (an Employee's own default portal per
// roleRedirect.ts anyway). A pending/cancelled notification is only ever
// sent to someone who can act on or FYI-track it (an approver or the
// request's manager), so it routes into whichever portal's approvals view
// that recipient actually has.
const OWN_REQUEST_PATHS: Record<string, string> = {
  leave_request: '/ess/leave',
  od_request: '/ess/od',
  attendance_regularization: '/ess/attendance?tab=requests',
  comp_off_credit: '/ess/comp-off',
};

const APPROVAL_TABS: Record<string, string> = {
  leave_request: 'leave',
  od_request: 'od',
  attendance_regularization: 'regularization',
  comp_off_credit: 'compOff',
};

function resolveTargetPath(notification: AppNotification, portal: string): string | null {
  // Holidays have no admin-facing "pending" counterpart (they're not a
  // request/approval flow) — every portal that has its own Holidays page
  // reads the same list, so just route to whichever one the recipient has.
  if (notification.type === 'holiday_reminder') {
    if (portal === '/company-admin') return '/company-admin/holidays';
    if (portal === '/brand-admin') return '/brand-admin/holidays';
    if (portal === '/ess') return '/ess/holidays';
    return null;
  }

  if (!notification.requestType) return null;

  // Payroll notifications (payslip processed / marked paid) always belong
  // to the recipient's own payslip view — there's no admin-facing "pending"
  // variant for payroll (runs are admin-initiated, not employee-submitted).
  if (notification.requestType === 'payroll_run') {
    return '/ess/payslips';
  }

  // A document's own owner always has their upload/verified/rejected status
  // on their own My Profile page — no separate "my documents" route exists.
  if (
    notification.requestType === 'employee_document' &&
    (notification.type === 'document_verified' || notification.type === 'document_rejected')
  ) {
    return '/ess/profile';
  }

  // A document *request* is always sent to the target employee, never an
  // approver — My Profile is also where they see and fulfill it.
  if (notification.requestType === 'document_upload_request') {
    return '/ess/profile';
  }

  if (notification.type === 'approval_decision' || notification.type === 'request_expired') {
    return OWN_REQUEST_PATHS[notification.requestType] ?? null;
  }

  if (notification.type === 'approval_pending' || notification.type === 'request_cancelled') {
    // A newly-uploaded document has no dedicated "pending" queue — route the
    // recipient to wherever they'd actually review it: Company Admin/Brand
    // Admin verify per-employee via the Employees list + detail modal; an
    // Employee holding the "Document Verification" power has its own page.
    if (notification.requestType === 'employee_document') {
      if (portal === '/company-admin') return '/company-admin/employees';
      if (portal === '/brand-admin') return '/brand-admin/employees';
      if (portal === '/ess') return '/ess/document-verification';
      return null;
    }

    const tab = APPROVAL_TABS[notification.requestType];
    if (portal === '/company-admin') return `/company-admin/approvals?tab=${tab}`;
    if (portal === '/brand-admin') return `/brand-admin/approvals?tab=${tab}`;
    // attendance_regularization/comp_off_credit have no manager/power-holder
    // path in ESS (only Company Admin/Brand Admin/HR Manager can ever hold
    // those :approve codes) — see leaveRequest.routes.js/odRequest.routes.js
    // vs attendanceRegularization.routes.js/compOff.routes.js.
    if (portal === '/ess' && (notification.requestType === 'leave_request' || notification.requestType === 'od_request')) {
      return `/ess/team-approvals?tab=${tab}`;
    }
    return null;
  }

  return null;
}

// Mounted once in the shared Topbar (portal-agnostic, same as the
// theme/logout controls), so every portal — Super Admin down to ESS — gets
// the same bell. Polls the unread count on an interval since this stack has
// no websocket/push infrastructure (Redis is restricted to QR attendance
// only); the badge uses Tailwind's built-in animate-ping for a persistent
// attention-grabbing pulse whenever there's something unread, matching the
// "blink to get attention" ask.
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Sound cue on new unread notifications (no websocket/push infra — see
  // POLL_INTERVAL_MS above — so "new" just means the unread count went up
  // between two polls). previousUnreadCountRef/hasInitializedRef track the
  // last-known count so the very first load (and any local optimistic
  // decrease from mark-read/mark-all-read) never falsely triggers a beep —
  // only a genuine increase does.
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousUnreadCountRef = useRef(0);
  const hasInitializedRef = useRef(false);

  function playNotificationSound() {
    try {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        // Browsers block audio until the user has interacted with the page
        // at least once — resume() is a no-op if that hasn't happened yet;
        // the next poll after any click/keypress will succeed.
        void ctx.resume();
      }
      const now = ctx.currentTime;
      // Two-tone chime (ascending), short and unobtrusive.
      [880, 1174.66].forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        const start = now + i * 0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.3);
      });
    } catch {
      // Sound is a nice-to-have — never let it break the poll cycle.
    }
  }

  function applyUnreadCount(next: number, { checkForNew = false }: { checkForNew?: boolean } = {}) {
    if (checkForNew && hasInitializedRef.current && next > previousUnreadCountRef.current) {
      playNotificationSound();
    }
    previousUnreadCountRef.current = next;
    hasInitializedRef.current = true;
    setUnreadCount(next);
  }

  async function refreshUnreadCount() {
    try {
      applyUnreadCount(await getUnreadNotificationCount(), { checkForNew: true });
    } catch {
      // Silent — a failed poll shouldn't surface as a user-facing error.
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      void audioContextRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function toggleOpen() {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      setIsLoading(true);
      try {
        const result = await listNotifications({ limit: PAGE_SIZE, offset: 0 });
        setNotifications(result.data);
        setOffset(result.data.length);
        setHasMore(result.data.length < result.pagination.total);
      } finally {
        setIsLoading(false);
      }
    }
  }

  async function loadMoreNotifications() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const result = await listNotifications({ limit: PAGE_SIZE, offset });
      setNotifications((prev) => [...prev, ...result.data]);
      const nextOffset = offset + result.data.length;
      setOffset(nextOffset);
      setHasMore(nextOffset < result.pagination.total);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handleListScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_MORE_THRESHOLD_PX) {
      loadMoreNotifications();
    }
  }

  async function handleNotificationClick(notification: AppNotification) {
    if (!notification.isRead) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
      applyUnreadCount(Math.max(0, previousUnreadCountRef.current - 1));
      await markNotificationRead(notification.id);
    }

    const portal = getDefaultRoute(user?.roles ?? []);
    const target = resolveTargetPath(notification, portal);
    setIsOpen(false);
    if (!target) return;

    // Navigating to a route the user isn't already on mounts that page
    // fresh, which fetches on its own — that's the "rerender" for a normal
    // jump. If they're already sitting on the exact target page/tab,
    // react-router won't remount it just because history.push() was called
    // again, so nothing would visibly update; force a full reload in that
    // one case to guarantee the just-changed data actually shows up.
    const [targetPath, targetSearch = ''] = target.split('?');
    const onTargetAlready = location.pathname === targetPath && location.search.replace(/^\?/, '') === targetSearch;
    if (onTargetAlready) {
      window.location.reload();
    } else {
      navigate(target);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    applyUnreadCount(0);
    await markAllNotificationsRead();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        className="relative rounded-lg p-2 text-ink-muted transition-colors hover:bg-page hover:text-ink"
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card shadow-lg animate-[modal-in_150ms_cubic-bezier(0.16,1,0.3,1)] sm:w-80">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto" onScroll={handleListScroll}>
            {isLoading && <p className="px-3.5 py-6 text-center text-sm text-ink-muted">Loading…</p>}
            {!isLoading && notifications.length === 0 && (
              <p className="px-3.5 py-6 text-center text-sm text-ink-muted">You're all caught up.</p>
            )}
            {!isLoading &&
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleNotificationClick(notification)}
                  className={[
                    'flex w-full items-start gap-2.5 border-b border-l-[3px] border-border px-3.5 py-2.5 text-left transition-colors last:border-b-0',
                    notification.isRead
                      ? 'border-l-transparent bg-card hover:bg-page'
                      : 'border-l-primary bg-primary-light hover:bg-primary-light/70',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      notification.isRead ? 'bg-transparent' : 'bg-primary',
                    ].join(' ')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{notification.title}</span>
                    {notification.body && (
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">{notification.body}</span>
                    )}
                    <span className="mt-0.5 block text-xs text-ink-muted">{timeAgo(notification.createdAt)}</span>
                  </span>
                </button>
              ))}
            {!isLoading && isLoadingMore && (
              <p className="px-3.5 py-3 text-center text-xs text-ink-muted">Loading more…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
