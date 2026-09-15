import { useLocation } from 'react-router-dom';

// True whenever the current route lives under /brand-admin/* — used by the
// several Brand-picker form fields (Shift/Roster/Holiday/Leave Type/Leave
// Policy/Company Policy/Comp-Off Policy/Department/Designation) that are
// mounted bare at both /company-admin/* and /brand-admin/* with no
// distinguishing prop. brands.length alone can't tell the two portals apart
// for a single-Brand company — a Brand Admin's own listBrands() call always
// resolves to exactly 1, same as a Company Admin's when the company itself
// only has one Brand — so the URL prefix is the only reliable signal.
export function useIsBrandAdminPortal(): boolean {
  const { pathname } = useLocation();
  return pathname.startsWith('/brand-admin');
}
