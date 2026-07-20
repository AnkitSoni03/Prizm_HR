import { apiClient } from '../client';
import type { CalculationType } from './salaryComponents';

export interface EmployeeSalaryComponent {
  id: string;
  componentDefinitionId: string;
  calculationType: CalculationType;
  value: number;
  resolvedAmount: number;
  definition?: { id: string; code: string; name: string; componentCategory: string } | null;
}

export interface EmployeeSalaryStructure {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  annualCtc: number;
  status: 'active' | 'superseded';
  components: EmployeeSalaryComponent[];
}

export async function listStructuresForEmployee(employeeId: string): Promise<EmployeeSalaryStructure[]> {
  const { data } = await apiClient.get<{ data: EmployeeSalaryStructure[] }>(
    `/payroll/structures/employee/${employeeId}`
  );
  return data.data;
}

export async function getActiveStructureForEmployee(employeeId: string): Promise<EmployeeSalaryStructure | null> {
  const { data } = await apiClient.get<{ data: EmployeeSalaryStructure | null }>(
    `/payroll/structures/employee/${employeeId}/active`
  );
  return data.data;
}

// value is optional per line — omitting it falls back to the component
// definition's own defaultValue (see salaryStructure.service.js).
export async function assignSalaryStructure(input: {
  employeeId: string;
  effectiveFrom: string;
  annualCtc: number;
  components: { componentDefinitionId: string; value?: number }[];
}): Promise<EmployeeSalaryStructure> {
  const { data } = await apiClient.post<{ data: EmployeeSalaryStructure }>('/payroll/structures', input);
  return data.data;
}
