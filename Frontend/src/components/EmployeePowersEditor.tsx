import { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from './ui/Button';
import { PowerAssignment } from './PowerAssignment';
import { listPowers, resolvePowerLevels, type PowerLevelMap } from '../api/powers';
import { assignEmployeePowers, getEmployee } from '../api/companyAdmin/employees';

// Self-contained "load current powers → edit → save" block for one employee.
// Used by the Group Admin / Super Admin employee view, which is otherwise
// read-only. The server decides who may grant what (utils/powerAuthority.js):
// Group Admin and Super Admin can grant any level, and Group Admin is
// confined to their own Group's employees.
export function EmployeePowersEditor({ employeeId, employeeHasBrand }: { employeeId: string; employeeHasBrand: boolean }) {
  const [powerLevels, setPowerLevels] = useState<PowerLevelMap>({});
  const [initialPowerLevels, setInitialPowerLevels] = useState<PowerLevelMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The list-view employee has no customRole/levels eager-loaded — fetch
    // the full record so each power pre-selects at its current level.
    Promise.all([listPowers(), getEmployee(employeeId)])
      .then(([catalog, employee]) => {
        if (cancelled) return;
        const levels = resolvePowerLevels(catalog, employee);
        setPowerLevels(levels);
        setInitialPowerLevels(levels);
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
    setIsSaving(true);
    try {
      await assignEmployeePowers(employeeId, powerLevels);
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
      />
      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={isSaving}>
          Save Powers
        </Button>
      </div>
    </div>
  );
}
