import { apiClient } from './client';

export interface Power {
  key: string;
  label: string;
  description: string;
  permissionCodes: string[];
}

// Single source of truth for the curated, hand-pickable "powers" an admin
// can grant to a specific Employee (see Backend/src/config/powerCatalog.js)
// — fetched once rather than hardcoded here so the two never drift.
export async function listPowers(): Promise<Power[]> {
  const { data } = await apiClient.get<{ data: Power[] }>('/powers');
  return data.data;
}
