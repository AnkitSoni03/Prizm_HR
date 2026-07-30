import { apiClient } from '../client';

// Mirrors Backend/src/config/statutoryDefaults.js's DEFAULT_STATUTORY_CONFIG
// shape. Only the fields exposed for editing in PayrollSettingsForm.tsx are
// typed here (PT slab-table editing is out of scope for this pass — the
// backend still resolves any missing field against its own defaults).
export interface StatutoryConfig {
  pf?: {
    enabled?: boolean;
    employeeRate?: number;
    employerRate?: number;
    wageCeiling?: number;
    applyCeiling?: boolean;
  };
  esi?: {
    enabled?: boolean;
    employeeRate?: number;
    employerRate?: number;
    wageThreshold?: number;
  };
  pt?: {
    enabled?: boolean;
    slabs?: Record<string, { upTo: number | null; amount: number }[]>;
  };
  tds?: {
    enabled?: boolean;
    standardDeduction?: number;
    cessRate?: number;
    rebate87A?: { thresholdTaxableIncome?: number; maxRebate?: number };
  };
}

export interface PayrollSettings {
  id: string;
  companyId: string;
  payCycleStartDay: number;
  enableStatutoryDeductions: boolean;
  statutoryConfig: StatutoryConfig;
  currency: string;
}

export async function getPayrollSettings(): Promise<PayrollSettings> {
  const { data } = await apiClient.get<{ data: PayrollSettings }>('/payroll/settings');
  return data.data;
}

export async function updatePayrollSettings(
  input: Partial<Pick<PayrollSettings, 'payCycleStartDay' | 'enableStatutoryDeductions' | 'currency' | 'statutoryConfig'>>
): Promise<PayrollSettings> {
  const { data } = await apiClient.patch<{ data: PayrollSettings }>('/payroll/settings', input);
  return data.data;
}
