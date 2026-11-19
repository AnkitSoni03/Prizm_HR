import type { AuthUser } from '../context/auth-context';

// "No Brand" choice for a Brand-mode company: the employee sits at company
// level (brandId null). Sent to the API as `brandId: null` on create /
// transfer, and as `brandId=none` on list filters.
export const NO_BRAND_VALUE = 'none';
export const NO_BRAND_LABEL = 'No Brand (company level)';

// Only company-wide callers may place someone outside every Brand — anyone
// holding a Brand-scoped grant (Brand Admin, a Brand-level power) is limited
// to their Brand(s), and the backend rejects "No Brand" for them anyway.
export function canUseNoBrand(user: AuthUser | null): boolean {
  if (!user || user.companyUsesBrands === false) return false;
  return !user.roles.some((role) => role.brandId);
}

// UI value → API brandId (null = "No Brand").
export function toApiBrandId(value: string): string | null {
  return value === NO_BRAND_VALUE ? null : value;
}
