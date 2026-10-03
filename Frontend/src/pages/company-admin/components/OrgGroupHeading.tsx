import { Building2, ChevronRight } from 'lucide-react';

// "Company › Brand · N employees" breadcrumb heading for one section. A
// direct-mode company (no Brands) shows just the company.
export function OrgGroupHeading({ companyName, brandName, count }: { companyName: string | null; brandName: string | null; count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <Building2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
      <span className="font-semibold text-ink">{companyName ?? '—'}</span>
      {brandName && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
          <span className="font-semibold text-ink">{brandName}</span>
        </>
      )}
      <span className="text-xs text-ink-muted">
        · {count} employee{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}
