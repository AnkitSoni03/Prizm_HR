import { apiClient } from '../client';
import type { ApproverUser } from './approvals';

export interface PayrollRun {
  id: string;
  periodMonth: number;
  periodYear: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: 'draft' | 'processed' | 'paid' | 'cancelled';
  totalGross: number | null;
  totalDeductions: number | null;
  totalNet: number | null;
  totalEmployerContributions: number | null;
  processedAt: string | null;
  paidAt: string | null;
  notes: string | null;
}

export interface PayrollRunListResult {
  data: PayrollRun[];
  pagination: { total: number; limit: number; offset: number };
}

// Distinct from the shared ApprovalHistoryEntry (approve/reject-shaped) —
// a payroll run's lifecycle is process/pay, not approve/reject, so this
// reuses the same audit table (approval_histories) but with its own action
// vocabulary. See utils/approvalHistory.js + the migration that widened
// approval_histories.action to add 'processed'/'paid'.
export interface PayrollRunHistoryEntry {
  id: string;
  action: 'processed' | 'paid';
  reason: string | null;
  decidedAt: string;
  actorUser?: ApproverUser | null;
}

export async function listPayrollRuns(
  params: { limit?: number; offset?: number } = {}
): Promise<PayrollRunListResult> {
  const { data } = await apiClient.get<PayrollRunListResult>('/payroll/runs', { params });
  return data;
}

export async function getPayrollRun(id: string): Promise<PayrollRun> {
  const { data } = await apiClient.get<{ data: PayrollRun }>(`/payroll/runs/${id}`);
  return data.data;
}

export async function createPayrollRun(input: { periodMonth: number; periodYear: number }): Promise<PayrollRun> {
  const { data } = await apiClient.post<{ data: PayrollRun }>('/payroll/runs', input);
  return data.data;
}

export async function processPayrollRun(id: string): Promise<PayrollRun> {
  const { data } = await apiClient.patch<{ data: PayrollRun }>(`/payroll/runs/${id}/process`);
  return data.data;
}

export async function payPayrollRun(id: string): Promise<PayrollRun> {
  const { data } = await apiClient.patch<{ data: PayrollRun }>(`/payroll/runs/${id}/pay`);
  return data.data;
}

export async function cancelPayrollRun(id: string): Promise<PayrollRun> {
  const { data } = await apiClient.patch<{ data: PayrollRun }>(`/payroll/runs/${id}/cancel`);
  return data.data;
}

export async function getPayrollRunHistory(id: string): Promise<PayrollRunHistoryEntry[]> {
  const { data } = await apiClient.get<{ data: PayrollRunHistoryEntry[] }>(`/payroll/runs/${id}/history`);
  return data.data;
}
