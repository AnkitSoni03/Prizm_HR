import { apiClient } from '../client';

export type ComponentCategory = 'earning' | 'deduction' | 'reimbursement';
export type CalculationType = 'fixed_amount' | 'percentage_of_component' | 'formula';

export interface SalaryComponentDefinition {
  id: string;
  companyId: string;
  code: string;
  name: string;
  componentCategory: ComponentCategory;
  calculationType: CalculationType;
  defaultValue: number;
  percentageOfComponentId: string | null;
  percentageOfComponent?: { id: string; code: string; name: string } | null;
  isStatutory: boolean;
  isPfWage: boolean;
  isActive: boolean;
  taxable: boolean;
  displayOrder: number;
}

export async function listSalaryComponents(includeInactive = false): Promise<SalaryComponentDefinition[]> {
  const { data } = await apiClient.get<{ data: SalaryComponentDefinition[] }>('/payroll/components', {
    params: { includeInactive: includeInactive || undefined },
  });
  return data.data;
}

export async function createSalaryComponent(input: {
  code: string;
  name: string;
  componentCategory: ComponentCategory;
  calculationType: CalculationType;
  defaultValue?: number;
  percentageOfComponentId?: string;
  displayOrder?: number;
  isPfWage?: boolean;
  taxable?: boolean;
}): Promise<SalaryComponentDefinition> {
  const { data } = await apiClient.post<{ data: SalaryComponentDefinition }>('/payroll/components', input);
  return data.data;
}

export async function updateSalaryComponent(
  id: string,
  input: Partial<{ name: string; defaultValue: number; displayOrder: number; isActive: boolean; isPfWage: boolean }>
): Promise<SalaryComponentDefinition> {
  const { data } = await apiClient.patch<{ data: SalaryComponentDefinition }>(`/payroll/components/${id}`, input);
  return data.data;
}

export async function deactivateSalaryComponent(id: string): Promise<void> {
  await apiClient.delete(`/payroll/components/${id}`);
}
