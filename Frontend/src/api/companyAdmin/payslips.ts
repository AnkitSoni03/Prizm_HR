import { apiClient } from '../client';

export interface PayslipComponent {
  id: string;
  componentDefinitionId: string | null;
  // 'employer_contribution' rows are informational only (employer PF/ESI
  // share) — never part of grossEarnings/totalDeductions/netPay.
  category: 'earning' | 'deduction' | 'reimbursement' | 'employer_contribution';
  name: string;
  amount: number;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employee?: { id: string; name: string | null; employeeCode: string } | null;
  payrollRun?: { id: string; periodMonth: number; periodYear: number; status: string } | null;
  salaryStructureId: string | null;
  workingDays: number;
  lopDays: number;
  payableDays: number;
  grossEarnings: number;
  totalDeductions: number;
  employerContributions: number;
  netPay: number;
  components?: PayslipComponent[];
}

export interface PayslipListResult {
  data: Payslip[];
  pagination: { total: number; limit: number; offset: number };
}

// Company Admin/HR-facing (payroll_run:read-gated) — payslips for one run.
export async function listPayslipsForRun(
  runId: string,
  params: { limit?: number; offset?: number } = {}
): Promise<PayslipListResult> {
  const { data } = await apiClient.get<PayslipListResult>(`/payroll/runs/${runId}/payslips`, { params });
  return data;
}

export async function getPayslip(id: string): Promise<Payslip> {
  const { data } = await apiClient.get<{ data: Payslip }>(`/payroll/payslips/${id}`);
  return data.data;
}

// ESS "My Payslips" — payslip:read_own scoped, no employeeId param (the
// server resolves it from the caller's own JWT).
export async function listMyPayslips(params: { limit?: number; offset?: number } = {}): Promise<PayslipListResult> {
  const { data } = await apiClient.get<PayslipListResult>('/payroll/payslips/mine', { params });
  return data;
}

export async function getMyPayslip(id: string): Promise<Payslip> {
  const { data } = await apiClient.get<{ data: Payslip }>(`/payroll/payslips/mine/${id}`);
  return data.data;
}
