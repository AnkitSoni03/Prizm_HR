import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from './ui/Button';
import { PowerAssignment } from './PowerAssignment';
import {
  listPowerBrands,
  listPowerGroupCompanies,
  listPowers,
  resolvePowerBrands,
  resolvePowerCompanies,
  resolvePowerLevels,
  type PowerBrand,
  type PowerBrandMap,
  type PowerCompanyMap,
  type PowerGroupCompany,
  type PowerLevelMap,
} from '../api/powers';
import { assignEmployeePowers, getEmployee } from '../api/companyAdmin/employees';

// Self-contained "load current powers → edit → save" block for one employee.
// Used by the Group Admin / Super Admin employee view, which is otherwise
// read-only. The server decides who may grant what (utils/powerAuthority.js):
// Group Admin and Super Admin can grant any level, and Group Admin is
// confined to their own Group's employees.
export function EmployeePowersEditor({ employeeId, employeeHasBrand }: { employeeId: string; employeeHasBrand: boolean }) {
  const [powerLevels, setPowerLevels] = useState<PowerLevelMap>({});
  const [initialPowerLevels, setInitialPowerLevels] = useState<PowerLevelMap>({});
  const [powerCompanies, setPowerCompanies] = useState<PowerCompanyMap>({});
  const [groupCompanies, setGroupCompanies] = useState<PowerGroupCompany[]>([]);
  const [powerBrands, setPowerBrands] = useState<PowerBrandMap>({});
  const [companyBrands, setCompanyBrands] = useState<PowerBrand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The list-view employee has no customRole/levels eager-loaded — fetch
    // the full record so each power pre-selects at its current level.
    Promise.all([
      listPowers(),
      getEmployee(employeeId),
      listPowerGroupCompanies(employeeId).catch((): PowerGroupCompany[] => []),
      listPowerBrands(employeeId).catch((): PowerBrand[] => []),
    ])
      .then(([catalog, employee, companies, brands]) => {
        if (cancelled) return;
        const levels = resolvePowerLevels(catalog, employee);
        setPowerLevels(levels);
        setInitialPowerLevels(levels);
        setPowerCompanies(resolvePowerCompanies(employee));
        setGroupCompanies(companies);
        setPowerBrands(resolvePowerBrands(employee));
        setCompanyBrands(brands);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load current powers.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    const emptyPick =
      Object.entries(powerCompanies).some(([key, ids]) => powerLevels[key] === 'group' && ids.length === 0) ||
      Object.entries(powerBrands).some(([key, ids]) => powerLevels[key] === 'company' && ids.length === 0);
    if (emptyPick) {
      setError('Tick at least one company / brand for each power limited to selected ones.');
      return;
    }
    setIsSaving(true);
    try {
      // Only send company choices when the Group's companies loaded —
      // otherwise the server keeps each power's current companies.
      await assignEmployeePowers(
        employeeId,
        powerLevels,
        groupCompanies.length > 0 ? powerCompanies : undefined,
        companyBrands.length > 0 ? powerBrands : undefined
      );
      setInitialPowerLevels(powerLevels);
      setSuccess(true);
    } catch (err) {
      setError(
        axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
          ? err.response.data.error
          : 'Could not save powers. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-ink-muted">Loading powers…</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-success">Powers updated.</p>}
      <PowerAssignment
        value={powerLevels}
        onChange={(next) => {
          setSuccess(false);
          setPowerLevels(next);
        }}
        initialValue={initialPowerLevels}
        employeeHasBrand={employeeHasBrand}
        companies={powerCompanies}
        onCompaniesChange={(next) => {
          setSuccess(false);
          setPowerCompanies(next);
        }}
        groupCompanies={groupCompanies}
        brands={powerBrands}
        onBrandsChange={(next) => {
          setSuccess(false);
          setPowerBrands(next);
        }}
        companyBrands={companyBrands}
      />
      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={isSaving}>
          Save Powers
        </Button>
      </div>
    </div>
  );
}
