import { apiClient } from './client';

export interface AppNotification {
  id: string;
  type:
    | 'approval_decision'
    | 'approval_pending'
    | 'request_cancelled'
    | 'request_expired'
    | 'payroll_run'
    | 'document_verified'
    | 'document_rejected'
    | 'document_upload_request'
    | 'holiday_reminder';
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
