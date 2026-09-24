import { apiClient } from './client';

// Scope a power is granted at — see Backend/src/config/powerCatalog.js:
// brand = the employee's own Brand only, company = every Brand in their
// company, group = every company in their Group.
export type PowerLevel = 'brand' | 'company' | 'group';

// { powerKey: level } — the shape an employee's assigned powers are stored
// and edited in (employees.custom_power_levels).
export type PowerLevelMap = Record<string, PowerLevel>;

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
