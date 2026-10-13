import { apiClient } from './client';

// Group-level payroll (Backend/src/modules/payroll/). Managers (Group Admin /
// "Manage Payroll" power at Group level) edit; Company/Brand Admins only view;
// /payroll/me/* is every employee's own salary.

export interface RateRule {
  enabled: boolean;
  rate?: number;
  ceiling?: number;
  applyCeiling?: boolean;
  grossLimit?: number;
  epsRate?: number;
  amount?: number;
  mode?: 'state' | 'fixed';
  fixedAmount?: number;
}

export interface PayrollRules {
  basicPercentOfCtc: number;
  hraPercentOfBasic: number;
  sandwichRule: boolean;
  deductions: {
    pf: RateRule;
    esi: RateRule;
    pt: RateRule;
    lwf: RateRule;
    tds: RateRule;
  };
  employer: {
    pf: RateRule;
    edli: RateRule;
    pfAdmin: RateRule;
    gratuity: RateRule;
    esi: RateRule;
    lwf: RateRule;
  };
  customItems: Record<string, { enabled: boolean; value?: number }>;
}

export interface PayrollTemplate {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  rules: PayrollRules;
  isActive: boolean;
  activeEmployees: number;
}

export type CustomItemKind = 'deduction' | 'employer_contribution';
export interface PayrollCustomItem {
  id: string;
  name: string;
  kind: CustomItemKind;
  calcType: 'percent' | 'fixed';
  basis: 'basic' | 'gross' | 'ctc' | null;
  value: string | number;
  isActive: boolean;
}

export interface BuiltInItem {
  key: string;
  kind: CustomItemKind;
  label: string;
}

export interface SalaryLine {
  key: string;
  name: string;
  rule?: string;
  full?: number;
  amount: number;
}

export interface SalaryBreakdown {
  monthlyCtc: number;
  full: { grossSalary: number; totalDeductions: number; totalEmployer: number; inHand: number };
  actual: { grossSalary: number; totalDeductions: number; totalEmployer: number; inHand: number };
  earnings: SalaryLine[];
  deductions: SalaryLine[];
  employer: SalaryLine[];
  pfSplit: {
    epsRate: number;
    full: { employeeEpf: number; employerEpf: number; eps: number };
    actual: { employeeEpf: number; employerEpf: number; eps: number };
  } | null;
  wageRule: { basic: number; ctc: number; percent: number; compliant: boolean };
  warnings: string[];
}

export interface EmployeeRef {
  id: string;
  name: string | null;
  employeeCode: string | null;
  companyId: string;
  brandId: string | null;
  workState?: string | null;
  company?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  designation?: { id: string; title: string } | null;
  department?: { id: string; name: string } | null;
}

export interface SalaryAssignment {
  id: string;
  employeeId: string;
  companyId: string;
  templateId: string;
  ctcPeriod: 'monthly' | 'yearly';
  ctcAmount: string | number;
  monthlyCtc: string | number;
  effectiveFrom: string;
  effectiveTo: string | null;
  deductionsEnabled: boolean;
  disabledItems: string[];
  status: 'active' | 'superseded' | 'ended';
  note: string | null;
  employee?: EmployeeRef;
  template?: { id: string; name: string } | null;
}

export interface PayrollDetails {
  companyName?: string | null;
  templateName?: string;
  deductionsEnabled?: boolean;
  salaryParts?: { from: string; to: string; monthlyCtc: number }[];
  earnings?: SalaryLine[];
  deductions: SalaryLine[];
  employer?: SalaryLine[];
  full?: SalaryBreakdown['full'];
  actual?: SalaryBreakdown['actual'];
  pfSplit?: SalaryBreakdown['pfSplit'];
  wageRule?: SalaryBreakdown['wageRule'];
  warnings?: string[];
  days: Record<string, number> | null;
  lopDates: { date: string; lop: number; reason: string | null }[];
  carries: { id: string; sourceYear: number; sourceMonth: number; amount: number }[];
}

export interface EmployeePayroll {
  id: string;
  employeeId?: string;
  periodYear: number;
  periodMonth: number;
  monthDays: number;
  paidDays: number;
  lopDays: number;
  monthlyCtc?: number;
  grossFull?: number;
  grossEarned?: number;
  totalDeductions: number;
  totalEmployer?: number;
  carryAdjustment: number;
  netPay: number;
  originalNet?: number;
  revision: number;
  revisedAt: string | null;
  generatedAt: string;
  payslipReleased: boolean;
  details: PayrollDetails;
  employee?: EmployeeRef;
}

export interface PayslipRequest {
  id: string;
  employeeId: string;
  periods: { year: number; month: number }[];
  note: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decidedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  employee?: EmployeeRef;
  decidedByUser?: { id: string; email: string } | null;
}

export interface ScopeCompany {
  id: string;
  name: string;
  usesBrands: boolean;
  brands: { id: string; name: string }[];
}

interface Paged<T> {
  data: T[];
  pagination: { total: number; limit: number; offset: number };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const periodLabel = (year: number, month: number) => `${MONTH_NAMES[month - 1]} ${year}`;
export const formatRupees = (value: number | string | null | undefined) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ---- Access / scope ----
export async function getPayrollAccess() {
  const { data } = await apiClient.get<{ data: { canManage: boolean; groupId: string | null; companyId: string | null } }>(
    '/payroll/access'
  );
  return data.data;
}
export async function listScopeCompanies() {
  const { data } = await apiClient.get<{ data: ScopeCompany[] }>('/payroll/companies');
  return data.data;
}

// ---- Templates ----
export async function listTemplates() {
  const { data } = await apiClient.get<{ data: PayrollTemplate[] }>('/payroll/templates');
  return data.data;
}
export async function getTemplateDefaults() {
  const { data } = await apiClient.get<{
    data: { rules: PayrollRules; builtInItems: BuiltInItem[]; customItems: PayrollCustomItem[]; ptStates: string[] };
  }>('/payroll/templates/defaults');
  return data.data;
}
export async function createTemplate(body: { name: string; description?: string | null; rules: PayrollRules; isActive?: boolean }) {
  const { data } = await apiClient.post<{ data: PayrollTemplate }>('/payroll/templates', body);
  return data.data;
}
export async function updateTemplate(
  id: string,
  body: { name?: string; description?: string | null; rules?: PayrollRules; isActive?: boolean }
) {
  const { data } = await apiClient.put<{ data: PayrollTemplate }>(`/payroll/templates/${id}`, body);
  return data.data;
}
export async function deleteTemplate(id: string) {
  await apiClient.delete(`/payroll/templates/${id}`);
}
export async function previewSalary(body: {
  rules?: PayrollRules;
  templateId?: string;
  ctcPeriod: 'monthly' | 'yearly';
  ctcAmount: number;
  deductionsEnabled?: boolean;
  disabledItems?: string[];
  workState?: string | null;
}) {
  const { data } = await apiClient.post<{ data: SalaryBreakdown }>('/payroll/preview', body);
  return data.data;
}

// ---- Custom deductions ----
export async function listCustomItems() {
  const { data } = await apiClient.get<{ data: PayrollCustomItem[]; builtInItems: BuiltInItem[] }>('/payroll/custom-items');
  return data;
}
export async function createCustomItem(body: Omit<PayrollCustomItem, 'id'>) {
  const { data } = await apiClient.post<{ data: PayrollCustomItem }>('/payroll/custom-items', body);
  return data.data;
}
export async function updateCustomItem(id: string, body: Partial<Omit<PayrollCustomItem, 'id'>>) {
  const { data } = await apiClient.put<{ data: PayrollCustomItem }>(`/payroll/custom-items/${id}`, body);
  return data.data;
}
export async function deleteCustomItem(id: string) {
  await apiClient.delete(`/payroll/custom-items/${id}`);
}

// ---- Salary assignments ----
export interface GroupEmployee extends EmployeeRef {
  salaryAssignments: { id: string; templateId: string; monthlyCtc: string; effectiveFrom: string }[];
}
export async function listGroupEmployees(params: { companyId?: string; brandId?: string; search?: string; limit?: number; offset?: number }) {
  const { data } = await apiClient.get<Paged<GroupEmployee>>('/payroll/employees', { params });
  return data;
}
export async function listAssignments(params: {
  companyId?: string;
  brandId?: string;
  templateId?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const { data } = await apiClient.get<Paged<SalaryAssignment>>('/payroll/assignments', { params });
  return data;
}
export async function listEmployeeSalaryHistory(employeeId: string) {
  const { data } = await apiClient.get<{ data: SalaryAssignment[] }>(`/payroll/assignments/employee/${employeeId}`);
  return data.data;
}
export interface AssignmentInput {
  employeeId?: string;
  templateId: string;
  ctcPeriod: 'monthly' | 'yearly';
  ctcAmount: number;
  effectiveFrom?: string;
  deductionsEnabled: boolean;
  disabledItems: string[];
  note?: string | null;
}
export async function assignSalary(body: AssignmentInput) {
  const { data } = await apiClient.post<{ data: SalaryAssignment }>('/payroll/assignments', body);
  return data.data;
}
export async function updateAssignment(id: string, body: Partial<AssignmentInput>) {
  const { data } = await apiClient.put<{ data: SalaryAssignment }>(`/payroll/assignments/${id}`, body);
  return data.data;
}
export async function endAssignment(id: string, endDate: string) {
  const { data } = await apiClient.post<{ data: SalaryAssignment }>(`/payroll/assignments/${id}/end`, { endDate });
  return data.data;
}

// ---- Monthly payroll ----
export async function listPayrolls(params: {
  year?: number;
  month?: number;
  companyId?: string;
  brandId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { data } = await apiClient.get<
    Paged<EmployeePayroll> & { totals: { gross: number; deductions: number; employer: number; net: number } }
  >('/payroll/months', { params });
  return data;
}
export async function getPayroll(id: string) {
  const { data } = await apiClient.get<{ data: EmployeePayroll }>(`/payroll/months/${id}`);
  return data.data;
}
export async function downloadPayrollPdf(id: string) {
  const { data } = await apiClient.get<Blob>(`/payroll/months/${id}/pdf`, { responseType: 'blob' });
  return data;
}
export async function recalculatePayroll(id: string) {
  const { data } = await apiClient.post<{ data: EmployeePayroll }>(`/payroll/months/${id}/recalculate`);
  return data.data;
}
export async function generatePayrollMonth(year: number, month: number) {
  const { data } = await apiClient.post<{ data: { created: number } }>('/payroll/months/generate', { year, month });
  return data.data;
}

// ---- Payslip requests (managers) ----
export async function listPayslipRequests(params: { status?: string; companyId?: string; search?: string; limit?: number; offset?: number }) {
  const { data } = await apiClient.get<Paged<PayslipRequest>>('/payroll/payslip-requests', { params });
  return data;
}
export async function decidePayslipRequest(id: string, decision: 'approved' | 'rejected', reason?: string) {
  const { data } = await apiClient.patch<{ data: PayslipRequest }>(`/payroll/payslip-requests/${id}/decision`, { decision, reason });
  return data.data;
}

// ---- Employee's own ----
export interface MySalary {
  current: { monthlyCtc: number; ctcPeriod: 'monthly' | 'yearly'; ctcAmount: number; effectiveFrom: string; deductionsEnabled: boolean } | null;
  months: EmployeePayroll[];
}
export async function getMySalary() {
  const { data } = await apiClient.get<{ data: MySalary }>('/payroll/me');
  return data.data;
}
export async function getMyPayroll(id: string) {
  const { data } = await apiClient.get<{ data: EmployeePayroll }>(`/payroll/me/months/${id}`);
  return data.data;
}
export async function downloadMyPayslipPdf(id: string) {
  const { data } = await apiClient.get<Blob>(`/payroll/me/months/${id}/pdf`, { responseType: 'blob' });
  return data;
}
export async function listMyPayslipRequests() {
  const { data } = await apiClient.get<{ data: PayslipRequest[] }>('/payroll/me/payslip-requests');
  return data.data;
}
export async function requestPayslips(periods: { year: number; month: number }[], note?: string) {
  const { data } = await apiClient.post<{ data: PayslipRequest }>('/payroll/me/payslip-requests', { periods, note });
  return data.data;
}
export async function cancelMyPayslipRequest(id: string) {
  await apiClient.patch(`/payroll/me/payslip-requests/${id}/cancel`);
}

// "Company › Brand" label for an employee row.
export function orgLabel(employee?: { company?: { name: string } | null; brand?: { name: string } | null }) {
  if (!employee) return '';
  return [employee.company?.name, employee.brand?.name].filter(Boolean).join(' › ');
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
