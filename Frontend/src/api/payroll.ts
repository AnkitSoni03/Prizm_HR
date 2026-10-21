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

// Who made a template / extra item: the Group (both null), one Company (and
// its brands), or one Brand. canEdit = the caller may change it.
export type PayrollLevel = 'group' | 'company' | 'brand';
export interface PayrollOwner {
  companyId: string | null;
  brandId: string | null;
  ownerLevel: PayrollLevel;
  canEdit: boolean;
  company?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
}
export const ownerLabel = (o: Partial<Pick<PayrollOwner, 'ownerLevel' | 'company' | 'brand'>>) =>
  o.ownerLevel === 'group' ? 'Group' : o.ownerLevel === 'company' ? o.company?.name ?? 'Company' : o.brand?.name ?? 'Brand';
// "Standard" for a Group template, "Standard · Acme, Beta" otherwise.
export const templateOptionLabel = (t: { name: string; targets?: TemplateTarget[] | null }) =>
  t.targets && t.targets.length > 0 ? `${t.name} · ${templateTargetsLabel(t)}` : t.name;
// Does a template / item made at this level apply to this employee?
export const ownerCovers = (o: Partial<Pick<PayrollOwner, 'companyId' | 'brandId'>>, e: { companyId?: string | null; brandId?: string | null }) =>
  !o.companyId || (String(o.companyId) === String(e.companyId) && (!o.brandId || String(o.brandId) === String(e.brandId)));

export interface PayrollAccess {
  level: PayrollLevel;
  canManage: boolean;
  groupId: string | null;
  companyId: string | null;
  brandIds: string[] | null;
}

// A template is made for one or more companies / brands (brandId null =
// that whole company); an empty list = the whole Group.
export interface TemplateTarget {
  companyId: string;
  brandId: string | null;
  companyName?: string | null;
  brandName?: string | null;
}
export const targetLabel = (t: TemplateTarget) =>
  t.brandId ? `${t.companyName ?? 'Company'} › ${t.brandName ?? 'Brand'}` : t.companyName ?? 'Company';
export const templateTargetsLabel = (t: { targets?: TemplateTarget[] | null }) =>
  t.targets && t.targets.length > 0 ? t.targets.map(targetLabel).join(', ') : 'Whole Group';
export const templateCovers = (t: { targets?: TemplateTarget[] | null }, e: { companyId?: string | null; brandId?: string | null }) =>
  !t.targets || t.targets.length === 0 || t.targets.some((x) => ownerCovers(x, e));

export interface PayrollTemplate {
  id: string;
  targets: TemplateTarget[];
  ownerLevel: PayrollLevel;
  canEdit: boolean;
  groupId: string;
  name: string;
  description: string | null;
  rules: PayrollRules;
  isActive: boolean;
  activeEmployees: number;
}

// 'earning' = a recurring allowance inside CTC (taken out of the Special allowance).
export type CustomItemKind = 'deduction' | 'employer_contribution' | 'earning';
export interface PayrollCustomItem extends Partial<PayrollOwner> {
  id: string;
  name: string;
  kind: CustomItemKind;
  calcType: 'percent' | 'fixed';
  basis: 'basic' | 'gross' | 'ctc' | null;
  value: string | number;
  // null = every month; ['2026-10', '2026-12'] = only those months.
  months?: string[] | null;
  isActive: boolean;
  // How many employees it applies to (list only).
  employeeCount?: number;
}
export type CustomItemInput = Omit<PayrollCustomItem, 'id' | 'employeeCount' | keyof PayrollOwner> & {
  employeeIds?: string[];
  // New items only: the level it's made at (omitted = the caller's own).
  companyId?: string | null;
  brandId?: string | null;
};

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

export interface BonusLine extends SalaryLine {
  type?: BonusType;
  taxable?: boolean;
}

export interface SalaryBreakdown {
  monthlyCtc: number;
  // Preview with an employee only: months (from now) whose in-hand differs
  // from the regular month because of a month-limited item or a bonus.
  months?: { month: string; extras: string[]; grossSalary: number; bonusTotal: number; totalDeductions: number; inHand: number }[];
  full: { grossSalary: number; totalDeductions: number; totalEmployer: number; inHand: number };
  actual: {
    grossSalary: number;
    bonusTotal?: number;
    taxableBonus?: number;
    totalEarnings?: number;
    totalDeductions: number;
    totalEmployer: number;
    inHand: number;
  };
  earnings: SalaryLine[];
  bonuses?: BonusLine[];
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
  // List only: the level that owns this salary, whether the caller may
  // change it, and whether the caller's level already asked for a release.
  ownerLevel?: PayrollLevel;
  canEdit?: boolean;
  releaseRequested?: boolean;
  employee?: EmployeeRef;
  template?: { id: string; name: string } | null;
  // List only: what the employee gets on top of the template.
  extras?: {
    items: { id: string; name: string; kind: CustomItemKind; calcType: 'percent' | 'fixed'; basis: 'basic' | 'gross' | 'ctc' | null; value: number; months: string[] | null }[];
    bonuses: { id: string; type: string; title: string | null; calcType: 'fixed' | 'percent'; percent: number | null; basis: string | null; amount: number; periodYear: number; periodMonth: number }[];
  };
}

export interface PayrollDetails {
  companyName?: string | null;
  templateName?: string;
  deductionsEnabled?: boolean;
  salaryParts?: { from: string; to: string; monthlyCtc: number }[];
  earnings?: SalaryLine[];
  bonuses?: BonusLine[];
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
  bonusTotal?: number;
  carryAdjustment: number;
  netPay: number;
  originalNet?: number;
  revision: number;
  revisedAt: string | null;
  generatedAt: string;
  payslipReleased: boolean;
  // Final settlement: the salary ends inside this month (paid up to finalDate).
  isFinal?: boolean;
  finalDate?: string | null;
  details: PayrollDetails;
  employee?: EmployeeRef;
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
// '2026-10' → 'Oct 2026'
export const monthKeyLabel = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1].slice(0, 3)} ${key.slice(0, 4)}`;
export const formatRupees = (value: number | string | null | undefined) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// ---- Access / scope ----
export async function getPayrollAccess() {
  const { data } = await apiClient.get<{ data: PayrollAccess }>('/payroll/access');
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
    data: { rules: PayrollRules; builtInItems: BuiltInItem[]; ptStates: string[] };
  }>('/payroll/templates/defaults');
  return data.data;
}
export async function createTemplate(body: {
  name: string;
  description?: string | null;
  rules: PayrollRules;
  isActive?: boolean;
  targets?: { companyId: string; brandId: string | null }[];
}) {
  const { data } = await apiClient.post<{ data: PayrollTemplate }>('/payroll/templates', body);
  return data.data;
}
export async function updateTemplate(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    rules?: PayrollRules;
    isActive?: boolean;
    targets?: { companyId: string; brandId: string | null }[];
  }
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
  // Include this employee's own every-month extra items.
  employeeId?: string;
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
// The employees an extra item applies to.
export async function listCustomItemEmployees(id: string) {
  const { data } = await apiClient.get<{ data: EmployeeRef[] }>(`/payroll/custom-items/${id}/employees`);
  return data.data;
}
export async function createCustomItem(body: CustomItemInput) {
  const { data } = await apiClient.post<{ data: PayrollCustomItem }>('/payroll/custom-items', body);
  return data.data;
}
export async function updateCustomItem(id: string, body: Partial<CustomItemInput>) {
  const { data } = await apiClient.put<{ data: PayrollCustomItem }>(`/payroll/custom-items/${id}`, body);
  return data.data;
}
export async function deleteCustomItem(id: string) {
  await apiClient.delete(`/payroll/custom-items/${id}`);
}

// ---- One-time bonuses / extra pay ----
export type BonusType = 'bonus' | 'incentive' | 'overtime' | 'reimbursement' | 'other';
export const BONUS_TYPES: { key: BonusType; label: string; taxable: boolean }[] = [
  { key: 'bonus', label: 'Bonus', taxable: true },
  { key: 'incentive', label: 'Incentive', taxable: true },
  { key: 'overtime', label: 'Overtime', taxable: true },
  { key: 'reimbursement', label: 'Reimbursement', taxable: false },
  { key: 'other', label: 'Other', taxable: true },
];
export const bonusTypeLabel = (type: string) => BONUS_TYPES.find((t) => t.key === type)?.label ?? type;

export interface PayrollBonus {
  id: string;
  employeeId: string;
  periodYear: number;
  periodMonth: number;
  type: BonusType;
  title: string | null;
  // 'percent' = percent % of the month's full monthly Basic / Gross / CTC;
  // amount is then the worked-out figure for this employee.
  calcType: 'fixed' | 'percent';
  percent: number | null;
  basis: 'basic' | 'gross' | 'ctc' | null;
  amount: number;
  taxable: boolean;
  note: string | null;
  createdAt: string;
  employee?: EmployeeRef;
  createdByUser?: { id: string; email: string } | null;
}
export interface BonusInput {
  employeeId?: string;
  // Bulk add: the same bonus for every employee listed.
  employeeIds?: string[];
  // Several months at once: one bonus per month (other months untouched).
  periods?: { year: number; month: number }[];
  year?: number;
  month?: number;
  type: BonusType;
  title?: string | null;
  calcType: 'fixed' | 'percent';
  amount?: number;
  percent?: number;
  basis?: 'basic' | 'gross' | 'ctc';
  taxable: boolean;
  note?: string | null;
}
export async function listBonuses(params: {
  year?: number;
  month?: number;
  type?: string;
  companyId?: string;
  brandId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { data } = await apiClient.get<Paged<PayrollBonus> & { total: number }>('/payroll/bonuses', { params });
  return data;
}
export type SkippedBonus = SkippedEmployee;
// Employees outside the Group or without a salary in that month are skipped
// (and listed) rather than failing the whole bulk add.
export async function createBonus(body: BonusInput) {
  const { data } = await apiClient.post<{ data: PayrollBonus[]; skipped: SkippedBonus[] }>('/payroll/bonuses', body);
  return data;
}
export async function updateBonus(id: string, body: Partial<BonusInput>) {
  const { data } = await apiClient.put<{ data: PayrollBonus }>(`/payroll/bonuses/${id}`, body);
  return data.data;
}
export async function deleteBonus(id: string) {
  await apiClient.delete(`/payroll/bonuses/${id}`);
}

// ---- Salary assignments ----
export interface GroupEmployee extends EmployeeRef {
  salaryAssignments: { id: string; templateId: string; monthlyCtc: string; effectiveFrom: string }[];
  // Current salary owned above the caller's level → can't be assigned until
  // released (requestSalaryRelease).
  ownerLevel?: PayrollLevel | null;
  locked?: boolean;
  releaseRequested?: boolean;
}
export const LEVEL_LABEL: Record<PayrollLevel, string> = { group: 'Group', company: 'Company', brand: 'Brand' };
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
export interface SkippedEmployee {
  employeeId: string;
  name: string | null;
  employeeCode?: string | null;
  reason: string;
}
// Same template / start date / switches for many employees, each with their
// own CTC. Anyone who can't take it (no CTC, start date before their current
// salary's, …) is skipped and listed; the rest are saved.
export async function bulkAssignSalary(
  body: Omit<AssignmentInput, 'employeeId' | 'ctcAmount'> & { items: { employeeId: string; ctcAmount: number }[] }
) {
  const { data } = await apiClient.post<{ data: SalaryAssignment[]; skipped: SkippedEmployee[] }>('/payroll/assignments/bulk', body);
  return data;
}
export async function updateAssignment(id: string, body: Partial<AssignmentInput>) {
  const { data } = await apiClient.put<{ data: SalaryAssignment }>(`/payroll/assignments/${id}`, body);
  return data.data;
}
// Ends a salary. When the last date is today or earlier in the running month,
// that month's final salary (up to the last date) comes back right away.
export async function endAssignment(id: string, endDate: string) {
  const { data } = await apiClient.post<{ data: { assignment: SalaryAssignment; finalPayroll: EmployeePayroll | null } }>(
    `/payroll/assignments/${id}/end`,
    { endDate }
  );
  return data.data;
}

// ---- Salary release ----
// A salary belongs to the level that assigned it; a lower level asks that
// level to release the employee. Approving hands the current salary down
// (it keeps running) so the requester can then assign their own template.
export type ReleaseStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface ReleaseRequest {
  id: string;
  employeeId: string;
  status: ReleaseStatus;
  reason: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  ownerLevel: PayrollLevel;
  toLevel: 'company' | 'brand';
  canDecide: boolean;
  employee?: EmployeeRef;
  assignment?: { id: string; monthlyCtc: string; effectiveFrom: string; template?: { id: string; name: string } | null } | null;
  toCompany?: { id: string; name: string } | null;
  toBrand?: { id: string; name: string } | null;
  requestedBy?: { id: string; email: string } | null;
  decidedBy?: { id: string; email: string } | null;
}
export async function listReleaseRequests(params: { direction: 'incoming' | 'outgoing'; status?: string; limit?: number; offset?: number }) {
  const { data } = await apiClient.get<Paged<ReleaseRequest>>('/payroll/releases', { params });
  return data;
}
export async function getPendingReleaseCount() {
  const { data } = await apiClient.get<{ data: { pending: number } }>('/payroll/releases/count');
  return data.data.pending;
}
export async function requestSalaryRelease(employeeIds: string[], reason?: string) {
  const { data } = await apiClient.post<{ data: ReleaseRequest[]; skipped: SkippedEmployee[] }>('/payroll/releases', { employeeIds, reason });
  return data;
}
export async function cancelReleaseRequests(ids: string[]) {
  const { data } = await apiClient.post<{ data: { cancelled: number } }>('/payroll/releases/cancel', { ids });
  return data.data;
}
export async function decideReleaseRequests(ids: string[], approve: boolean, note?: string) {
  const { data } = await apiClient.post<{ data: { decided: number } }>('/payroll/releases/decide', { ids, approve, note });
  return data.data;
}
export async function releaseEmployees(employeeIds: string[], to: 'company' | 'brand') {
  const { data } = await apiClient.post<{ data: { released: number }; skipped: SkippedEmployee[] }>('/payroll/releases/direct', { employeeIds, to });
  return data;
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
    Paged<EmployeePayroll> & { totals: { gross: number; deductions: number; employer: number; bonus: number; net: number } }
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

// ---- Sharing payslips with employees (managers) ----
// Either chosen payroll rows (`ids`) or a whole month (narrowed by company / brand).
export async function sharePayrolls(body: {
  ids?: string[];
  year?: number;
  month?: number;
  companyId?: string;
  brandId?: string;
  share: boolean;
}) {
  const { data } = await apiClient.post<{ data: { updated: number } }>('/payroll/months/share', body);
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
// Whether a deduction / contribution / allowance key is switched on in a template.
export function isItemOnInTemplate(rules: PayrollRules, key: string): boolean {
  const map: Record<string, { enabled: boolean } | undefined> = {
    pf: rules.deductions.pf,
    esi: rules.deductions.esi,
    pt: rules.deductions.pt,
    lwf: rules.deductions.lwf,
    tds: rules.deductions.tds,
    employer_pf: rules.employer.pf,
    edli: rules.employer.edli,
    pf_admin: rules.employer.pfAdmin,
    gratuity: rules.employer.gratuity,
    employer_esi: rules.employer.esi,
    employer_lwf: rules.employer.lwf,
  };
  return !!map[key]?.enabled;
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
