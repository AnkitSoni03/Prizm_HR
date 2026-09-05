import { apiClient, refreshAccessToken } from './client';
import { getTokens } from './tokenStore';

export interface AppNotification {
  id: string;
  type:
    | 'approval_decision'
    | 'approval_pending'
    | 'approval_progress'
    | 'request_cancelled'
    | 'request_expired'
    | 'payroll_run'
    | 'document_verified'
    | 'document_rejected'
    | 'document_upload_request'
    | 'holiday_reminder'
    | 'leave_balance_updated';
  requestType:
    | 'leave_request'
    | 'od_request'
    | 'attendance_regularization'
    | 'comp_off_credit'
    | 'payroll_run'
    | 'employee_document'
    | 'document_upload_request'
    | null;
  requestId: string | null;
  title: string;
  body: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface ListResult {
  data: AppNotification[];
  pagination: { total: number; limit: number; offset: number };
}

// Portal-agnostic — every authenticated user (Super Admin down to Employee)
// reads and manages only their own notifications, same shape as /powers or
// /auth/me. Used by the shared NotificationBell mounted in every portal's
// Topbar.
export async function listNotifications(params: { limit?: number; offset?: number } = {}): Promise<ListResult> {
  const { data } = await apiClient.get<ListResult>('/notifications', { params });
  return data;
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.patch('/notifications/read-all');
}

// Real-time push replacing the old 30s poll: one long-lived connection per
// tab, server writes a `data:` line the instant notifyUser/notifyApprovers
// creates a row (Backend/src/utils/notifications.js). EventSource can't set
// an Authorization header, so the access token rides the URL's query string
// instead — see requireAuthSSE (Backend/src/middleware/auth.middleware.js).
// Returns an unsubscribe function.
export function subscribeToNotificationStream(onNotification: (notification: AppNotification) => void): () => void {
  let stopped = false;
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function connect() {
    if (stopped) return;

    // The access token is ~15min-lived and kept in memory only (see
    // tokenStore.ts) — refresh proactively whenever we don't already have
    // one on hand (e.g. right after a page load) rather than opening a
    // connection we know will be rejected.
    const accessToken = getTokens().accessToken ?? (await refreshAccessToken());
    if (stopped || !accessToken) return;

    const url = `${apiClient.defaults.baseURL}/notifications/stream?token=${encodeURIComponent(accessToken)}`;
    source = new EventSource(url);

    source.onmessage = (event) => {
      try {
        onNotification(JSON.parse(event.data) as AppNotification);
      } catch {
        // Malformed/heartbeat payload — ignore.
      }
    };

    // Fires on a dropped connection AND on a 401 (the access token expired
    // mid-stream, since it's a fixed value baked into this connection's URL
    // rather than refreshed like the header on normal axios calls) — either
    // way, close, get a fresh token, and reconnect after a short delay.
    source.onerror = () => {
      source?.close();
      source = null;
      if (stopped) return;
      retryTimer = setTimeout(async () => {
        await refreshAccessToken();
        connect();
      }, 3000);
    };
  }

  connect();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
}
