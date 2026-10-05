import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { setActingCompanyId } from '../api/tokenStore';
import { getDefaultRoute } from '../routes/roleRedirect';

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

function brandNames(company: { brands?: { name: string }[] } | undefined) {
  return (company?.brands ?? []).map((brand) => brand.name);
}

function CompanyAvatar({ name, tone }: { name: string; tone: 'primary' | 'warning' | 'muted' }) {
  const toneClass =
    tone === 'warning'
      ? 'bg-warning/15 text-warning'
      : tone === 'primary'
        ? 'bg-primary text-white'
        : 'bg-page text-ink-muted ring-1 ring-border';
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold ${toneClass}`}
    >
      {initials(name)}
    </span>
  );
}

// "Working in: <company>" picker for a user holding a group-level power —
// renders nothing for everyone else. Switching sets X-Acting-Company-Id for
// this tab (api/tokenStore.ts) and does a full reload onto the portal home,
// so every page refetches under the new company rather than showing data
// fetched for the previous one. While acting in a sibling company it turns
// amber, so it's always obvious whose data is on screen.
export function CompanySwitcher() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const companies = user?.groupPowerCompanies ?? [];
  if (!user || companies.length < 2) return null;

  const home = companies.find((company) => company.isHome);
  const currentId = user.actingCompanyId ?? home?.id ?? '';
  const current = companies.find((company) => company.id === currentId) ?? home;
  const isActing = !!user.actingCompanyId;
  // Own company first, then the rest alphabetically (server sorts by name).
  const ordered = [...companies].sort((a, b) => Number(b.isHome) - Number(a.isHome));

  function handleSelect(companyId: string) {
    setIsOpen(false);
    if (!user || companyId === currentId) return;
    setActingCompanyId(companyId === home?.id ? null : companyId);
    window.location.assign(getDefaultRoute(user.roles));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={isActing ? 'Working in another company with your group-level powers' : 'Switch company'}
        className={`flex items-center gap-2 rounded-xl border py-1 pl-1 pr-2.5 text-left shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 ${
          isActing
            ? 'border-warning/40 bg-warning/10 hover:border-warning/60 focus:ring-warning/30'
            : 'border-border bg-card hover:border-primary/40 focus:ring-primary/20'
        }`}
      >
        <CompanyAvatar name={current?.name ?? ''} tone={isActing ? 'warning' : 'primary'} />
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className={`text-[10px] font-medium uppercase tracking-wide ${isActing ? 'text-warning' : 'text-ink-muted'}`}>
            {isActing ? 'Working in' : 'Company'}
          </span>
          <span className="max-w-[11rem] truncate text-sm font-semibold text-ink lg:max-w-[16rem]">
            {current?.name}
            {brandNames(current).length > 0 && (
              <span className="font-normal text-ink-muted"> › {brandNames(current).join(', ')}</span>
            )}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl sm:left-0 sm:right-auto">
          <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
            <Building2 className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
            <div>
              <p className="text-sm font-semibold text-ink">Switch company</p>
              <p className="text-xs text-ink-muted">Your group-level powers apply in each</p>
            </div>
          </div>
          <ul role="listbox" className="max-h-80 overflow-y-auto p-1.5">
            {ordered.map((company) => {
              const isCurrent = company.id === currentId;
              const brands = brandNames(company);
              return (
                <li key={company.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    onClick={() => handleSelect(company.id)}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                      isCurrent ? 'bg-primary-light' : 'hover:bg-page'
                    }`}
                  >
                    <CompanyAvatar name={company.name} tone={isCurrent ? 'primary' : 'muted'} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${isCurrent ? 'font-semibold text-primary' : 'text-ink'}`}>
                        {company.name}
                      </span>
                      {brands.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {brands.map((brand) => (
                            <span
                              key={brand}
                              className="rounded-md bg-page px-1.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-border"
                            >
                              {brand}
                            </span>
                          ))}
                        </span>
                      )}
                      {company.isHome && <span className="mt-0.5 block text-xs text-ink-muted">Your company</span>}
                    </span>
                    {isCurrent && <Check className="mt-1.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
