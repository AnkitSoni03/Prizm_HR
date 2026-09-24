import { Building2, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { setActingCompanyId } from '../api/tokenStore';
import { getDefaultRoute } from '../routes/roleRedirect';

// "Working in: <company>" picker for a user holding a group-level power —
// renders nothing for everyone else. Switching sets X-Acting-Company-Id for
// this tab (api/tokenStore.ts) and does a full reload onto the portal home,
// so every page refetches under the new company rather than showing data
// fetched for the previous one. While acting in a sibling company it turns
// amber, so it's always obvious whose data is on screen.
export function CompanySwitcher() {
  const { user } = useAuth();
  const companies = user?.groupPowerCompanies ?? [];
  if (!user || companies.length < 2) return null;

  const home = companies.find((company) => company.isHome);
  const currentId = user.actingCompanyId ?? home?.id ?? '';
  const isActing = !!user.actingCompanyId;

  function handleChange(companyId: string) {
    if (!user || companyId === currentId) return;
    setActingCompanyId(companyId === home?.id ? null : companyId);
    window.location.assign(getDefaultRoute(user.roles));
  }

  return (
    <label
      className={`relative flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition sm:text-sm ${
        isActing ? 'border-warning/50 bg-warning/10 text-warning' : 'border-border bg-card text-ink'
      }`}
      title={isActing ? 'Working in another company with your group-level powers' : 'Switch company'}
    >
      <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="hidden text-ink-muted lg:inline">Working in</span>
      <select
        value={currentId}
        onChange={(event) => handleChange(event.target.value)}
        aria-label="Company you are working in"
        className="max-w-[9rem] cursor-pointer appearance-none truncate bg-transparent pr-4 font-medium focus:outline-none sm:max-w-[14rem]"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id} className="bg-card text-ink">
            {company.name}
            {company.isHome ? ' (your company)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5" strokeWidth={2} />
    </label>
  );
}
