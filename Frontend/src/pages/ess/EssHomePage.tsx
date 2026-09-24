import { Link } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { setActingCompanyId } from '../../api/tokenStore';
import { ESS_NAV, isNavItemVisible } from '../../routes/navConfig';
import { Button } from '../../components/ui/Button';
import { EssDashboard } from './EssDashboard';

// ESS home. Normally the personal dashboard — but while working in a sibling
// company through a group-level power (see components/CompanySwitcher.tsx),
// the caller has no attendance/leave/payslips of their own there, so the
// dashboard's personal widgets would only fail. Show where they are and
// what they can do there instead.
export function EssHomePage() {
  const { user, hasPermission } = useAuth();
  if (!user?.actingCompanyId) return <EssDashboard />;

  const company = user.groupPowerCompanies.find((c) => c.id === user.actingCompanyId);
  const home = user.groupPowerCompanies.find((c) => c.isHome);
  const powerPages = ESS_NAV.filter((item) => item.path !== '/ess' && isNavItemVisible(item, hasPermission, true));

  function backToHome() {
    setActingCompanyId(null);
    window.location.assign('/ess');
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Building2 className="h-5 w-5 text-warning" strokeWidth={1.75} />
          You&apos;re working in {company?.name ?? 'another company'}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Only your Group-level powers apply here. Your own attendance, leave and payslips stay in{' '}
          {home?.name ?? 'your company'}.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={backToHome}>
            Back to {home?.name ?? 'my company'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-ink">What you can do here</h3>
        {powerPages.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">None of your Group-level powers has a page here yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {powerPages.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm text-ink transition hover:border-primary/40 hover:bg-page"
                >
                  <span className="flex items-center gap-2.5">
                    <item.icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
                    {item.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-ink-muted" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
