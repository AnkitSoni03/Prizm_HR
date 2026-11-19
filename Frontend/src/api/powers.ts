import { apiClient } from './client';

// Scope a power is granted at — see Backend/src/config/powerCatalog.js:
// brand = the employee's own Brand only, company = every Brand in their
// company, group = every company in their Group.
export type PowerLevel = 'brand' | 'company' | 'group';

// { powerKey: level } — the shape an employee's assigned powers are stored
// and edited in (employees.custom_power_levels).
export type PowerLevelMap = Record<string, PowerLevel>;

// { powerKey: companyIds } — a Group-level power limited to these companies of
// the Group (employees.custom_power_companies). A power not in the map covers
// every company of the Group, including ones added later.
export type PowerCompanyMap = Record<string, string[]>;

// { powerKey: ids } — generic shape of a company or brand limit.
export type PowerLimitMap = Record<string, string[]>;

// { powerKey: brandIds } — a Company-level power limited to these brands of
// the employee's company (employees.custom_power_brands); absent = all brands.
export type PowerBrandMap = PowerLimitMap;

export interface PowerBrand {
  id: string;
  name: string;
  isActive: boolean;
  isEmployeeBrand: boolean;
}

export interface PowerGroupCompany {
  id: string;
  name: string;
  status: string;
  isEmployeeCompany: boolean;
}

export interface Power {
  key: string;
  label: string;
  description: string;
  permissionCodes: string[];
  // Every level this power can ever be granted at.
  levels: PowerLevel[];
  // The subset the CURRENT caller may grant ("no one grants wider than they
  // hold") — the server enforces the same rule on save.
  allowedLevels: PowerLevel[];
  // Group level can be limited to chosen companies (false for Manage Payroll).
  companyLimitable: boolean;
}

export const POWER_LEVEL_LABELS: Record<PowerLevel, string> = {
  brand: 'Brand',
  company: 'Company',
  group: 'Group',
};

export const POWER_LEVEL_HINTS: Record<PowerLevel, string> = {
  brand: "Only this employee's own Brand",
  company: 'All Brands in this company',
  group: 'All companies in this Group',
};

// Single source of truth for the curated, hand-pickable "powers" an admin
// can grant to a specific Employee (see Backend/src/config/powerCatalog.js)
// — fetched once rather than hardcoded here so the two never drift.
export async function listPowers(): Promise<Power[]> {
  const { data } = await apiClient.get<{ data: Power[] }>('/powers');
  return data.data;
}

// Companies of this employee's Group, to choose which ones a Group-level
// power covers. Only Group Admin / Super Admin may call it.
export async function listPowerGroupCompanies(employeeId: string): Promise<PowerGroupCompany[]> {
  const { data } = await apiClient.get<{ data: PowerGroupCompany[] }>('/powers/companies', { params: { employeeId } });
  return data.data;
}

// Brands of this employee's company, to choose which ones a Company-level
// power covers.
export async function listPowerBrands(employeeId: string): Promise<PowerBrand[]> {
  const { data } = await apiClient.get<{ data: PowerBrand[] }>('/powers/brands', { params: { employeeId } });
  return data.data;
}

// An employee's current Company-level brand limits.
export function resolvePowerBrands(employee: { customPowerBrands?: Record<string, (string | number)[]> | null }): PowerBrandMap {
  const map: PowerBrandMap = {};
  for (const [key, ids] of Object.entries(employee.customPowerBrands ?? {})) {
    if (Array.isArray(ids)) map[key] = ids.map(String);
  }
  return map;
}

// An employee's current Group-level company limits.
export function resolvePowerCompanies(employee: { customPowerCompanies?: Record<string, (string | number)[]> | null }): PowerCompanyMap {
  const map: PowerCompanyMap = {};
  for (const [key, ids] of Object.entries(employee.customPowerCompanies ?? {})) {
    if (Array.isArray(ids)) map[key] = ids.map(String);
  }
  return map;
}

// An employee's current powers. Prefers the recorded per-power levels; an
// employee whose powers predate levels only has a company-level customRole,
// so every fully-granted power there reads as 'company'.
export function resolvePowerLevels(
  catalog: Power[],
  employee: {
    customPowerLevels?: PowerLevelMap | null;
    customRole?: { permissions: { code: string }[] } | null;
  }
): PowerLevelMap {
  if (employee.customPowerLevels) return { ...employee.customPowerLevels };
  const granted = new Set((employee.customRole?.permissions ?? []).map((p) => p.code));
  const levels: PowerLevelMap = {};
  for (const power of catalog) {
    if (power.permissionCodes.length > 0 && power.permissionCodes.every((code) => granted.has(code))) {
      levels[power.key] = 'company';
    }
  }
  return levels;
}
