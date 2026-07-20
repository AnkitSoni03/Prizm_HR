import { apiClient } from '../client';
import type { DashboardSummary } from '../companyAdmin/dashboard';

// brandId isn't on the JWT (see auth.middleware.js's requireAuth), so unlike
// Company Admin's getDashboardSummary(), the caller must supply its own —
// the Brand Admin portal reads it off useAuth().user.roles.
export async function getBrandDashboardSummary(brandId: string): Promise<DashboardSummary> {
  const { data } = await apiClient.get<{ data: DashboardSummary }>('/dashboard/brand-summary', {
    params: { brandId },
  });
  return data.data;
}
