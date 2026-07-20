import { useEffect, useMemo, useState } from 'react';
import { Search, Users as UsersIcon } from 'lucide-react';
import { EmptyStateCard } from '../../components/EmptyStateCard';
import {
  listBrands,
  listCompanies,
  listEmployeesPage,
  listGroups,
  type Brand,
  type Company,
  type Employee,
  type Group,
} from '../../api/tenancy';
import { UserDirectorySection, type DirectorySection } from './components/UserDirectorySection';

// Each round trip fetches at most this many employees — the platform-wide
// list is paged through in full (see loadEmployees below) rather than
// capped at one page, since this view intentionally shows every employee
// regardless of which admin (Company Admin, HR Manager, Brand Admin, ...)
// created them.
const FETCH_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 300;

export function UsersPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(true);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    Promise.all([listGroups(), listCompanies(), listBrands()])
      .then(([groupRows, companyRows, brandRows]) => {
        setGroups(groupRows);
        setCompanies(companyRows);
        setBrands(brandRows);
      })
      .catch(() => setError('Could not load the Group/Company/Brand hierarchy.'))
      .finally(() => setIsLoadingHierarchy(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      setIsLoadingEmployees(true);
      setError(null);
      try {
        const collected: Employee[] = [];
        let offset = 0;
        let grandTotal = 0;
        for (;;) {
          const { rows, total: pageTotal } = await listEmployeesPage({
            search,
            limit: FETCH_PAGE_SIZE,
            offset,
          });
          if (cancelled) return;
          collected.push(...rows);
          grandTotal = pageTotal;
          offset += FETCH_PAGE_SIZE;
          if (rows.length === 0 || collected.length >= grandTotal) break;
        }
        if (cancelled) return;
        setEmployees(collected);
        setTotal(grandTotal);
      } catch {
        if (!cancelled) setError('Could not load employees.');
      } finally {
        if (!cancelled) setIsLoadingEmployees(false);
      }
    }

    loadEmployees();
    return () => {
      cancelled = true;
    };
  }, [search]);

  const sections = useMemo<DirectorySection[]>(() => {
    const companyById = new Map(companies.map((company) => [company.id, company]));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const brandById = new Map(brands.map((brand) => [brand.id, brand]));

    const buckets = new Map<string, DirectorySection>();
    for (const employee of employees) {
      const key = `${employee.companyId}:${employee.brandId ?? 'direct'}`;
      let section = buckets.get(key);
      if (!section) {
        const company = companyById.get(employee.companyId);
        const group = company ? groupById.get(company.groupId) : undefined;
        const brand = employee.brandId ? brandById.get(employee.brandId) : undefined;
        section = {
          key,
          groupName: group?.name ?? 'Unknown Group',
          companyName: company?.name ?? 'Unknown Company',
          brandName: employee.brandId ? (brand?.name ?? 'Unknown Brand') : null,
          employees: [],
        };
        buckets.set(key, section);
      }
      section.employees.push(employee);
    }

    return Array.from(buckets.values()).sort(
      (a, b) =>
        a.groupName.localeCompare(b.groupName) ||
        a.companyName.localeCompare(b.companyName) ||
        (a.brandName ?? '').localeCompare(b.brandName ?? '')
    );
  }, [employees, companies, groups, brands]);

  const isLoading = isLoadingHierarchy || isLoadingEmployees;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-primary" strokeWidth={1.75} />
          <p className="text-sm font-medium text-ink">
            {isLoading ? 'Loading…' : `${total} employee${total === 1 ? '' : 's'} total`}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search employees by name or code…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted transition-all duration-150 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {!isLoading && !error && sections.length === 0 && (
        <EmptyStateCard
          icon={UsersIcon}
          title="No employees found"
          description={search ? 'No employees match your search.' : 'No employees have been added yet.'}
        />
      )}

      {!isLoading &&
        sections.map((section, index) => (
          <div key={section.key}>
            <UserDirectorySection section={section} />
            {index < sections.length - 1 && <hr className="mt-4 border-border" />}
          </div>
        ))}
    </div>
  );
}
