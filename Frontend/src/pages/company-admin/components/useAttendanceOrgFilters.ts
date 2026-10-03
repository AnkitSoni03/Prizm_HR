import { useEffect, useState } from 'react';
import { listBrands } from '../../../api/companyAdmin/org';
import { listBrands as listCompanyBrands, listCompanies, type Brand, type Company } from '../../../api/tenancy';

// Company/Brand filter state shared by the Attendance Records and Attendance
// Board pages. Single-company callers (Company Admin/HR/Brand Admin) only get
// a Brand filter — listBrands() is already scoped to their own company (and
// to their own Brand for a Brand Admin, so it stays hidden for them). In
// groupMode (Group Admin) there's also a Company filter: '' means every
// company in the Group (one group-wide view), and the Brand filter only
// appears once a specific company is picked, listing that company's Brands.
export function useAttendanceOrgFilters(groupMode: boolean) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyFilter, setCompanyFilterState] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandFilter, setBrandFilter] = useState('');

  useEffect(() => {
    if (!groupMode) return;
    listCompanies()
      .then(setCompanies)
      .catch(() => {
        /* non-critical — the Company filter just stays at "All Companies" */
      });
  }, [groupMode]);

  useEffect(() => {
    let cancelled = false;
    const request = groupMode
      ? companyFilter
        ? listCompanyBrands(companyFilter)
        : Promise.resolve<Brand[]>([])
      : listBrands();
    request
      .then((result) => {
        if (!cancelled) setBrands(result);
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [groupMode, companyFilter]);

  function setCompanyFilter(value: string) {
    setCompanyFilterState(value);
    setBrandFilter('');
  }

  return {
    companies,
    companyFilter,
    setCompanyFilter,
    brands,
    brandFilter,
    setBrandFilter,
    // What to actually send: a brand only when there's a real choice to
    // make, a company only in groupMode.
    companyId: groupMode ? companyFilter || undefined : undefined,
    brandId: brands.length > 1 ? brandFilter || undefined : undefined,
  };
}
