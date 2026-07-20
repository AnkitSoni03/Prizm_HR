import { apiClient } from '../client';

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string | null; employeeCode: string } | null;
  payrollRunId: string | null;
  periodMonth: number;
  periodYear: number;
  componentDefinitionId: string | null;
  definition?: { id: string; code: string; name: string } | null;
  type: 'bonus' | 'deduction';
  amount: number;
  description: string | null;
  status: 'pending' | 'applied' | 'cancelled';
}

export interface PayrollAdjustmentListResult {
  data: PayrollAdjustment[];
  pagination: { total: number; limit: number; offset: number };
}

export async function listPayrollAdjustments(
  params: { employeeId?: string; periodMonth?: number; periodYear?: number; status?: string; limit?: number; offset?: number } = {}
): Promise<PayrollAdjustmentListResult> {
  const { data } = await apiClient.get<PayrollAdjustmentListResult>('/payroll/adjustments', { params });
  return data;
}

export async function createPayrollAdjustment(input: {
  employeeId: string;
  periodMonth: number;
  periodYear: number;
  componentDefinitionId?: string;
  type: 'bonus' | 'deduction';
  amount: number;
  description?: string;
}): Promise<PayrollAdjustment> {
  const { data } = await apiClient.post<{ data: PayrollAdjustment }>('/payroll/adjustments', input);
  return data.data;
}

export async function cancelPayrollAdjustment(id: string): Promise<void> {
  await apiClient.delete(`/payroll/adjustments/${id}`);
}
