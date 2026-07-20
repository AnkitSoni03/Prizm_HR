import { apiClient } from '../client';

export interface PayrollSettings {
  id: string;
  companyId: string;
  payCycleStartDay: number;
  enableStatutoryDeductions: boolean;
  statutoryConfig: Record<string, unknown>;
  currency: string;
}

export async function getPayrollSettings(): Promise<PayrollSettings> {
  const { data } = await apiClient.get<{ data: PayrollSettings }>('/payroll/settings');
  return data.data;
}

export async function updatePayrollSettings(
  input: Partial<Pick<PayrollSettings, 'payCycleStartDay' | 'enableStatutoryDeductions' | 'currency'>>
): Promise<PayrollSettings> {
  const { data } = await apiClient.patch<{ data: PayrollSettings }>('/payroll/settings', input);
  return data.data;
}
