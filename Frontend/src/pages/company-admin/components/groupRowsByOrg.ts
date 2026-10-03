interface OrgRow {
  companyId: string;
  companyName: string | null;
  brandId: string | null;
  brandName: string | null;
}

export interface OrgGroup<T> {
  key: string;
  companyName: string | null;
  brandName: string | null;
  rows: T[];
}

// Splits Group Admin attendance rows into Company > Brand sections, in the
// order the rows already arrive in (the backend sorts by company, then
// brand, then employee name) — so each section is one contiguous run and
// no re-sorting happens here.
export function groupRowsByOrg<T extends OrgRow>(rows: T[]): OrgGroup<T>[] {
  const groups: OrgGroup<T>[] = [];
  for (const row of rows) {
    const key = `${row.companyId}:${row.brandId ?? ''}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, companyName: row.companyName, brandName: row.brandName, rows: [row] });
  }
  return groups;
}
