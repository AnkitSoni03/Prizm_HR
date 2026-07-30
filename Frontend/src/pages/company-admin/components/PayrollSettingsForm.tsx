import { useEffect, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../context/auth-context';
import {
  getPayrollSettings,
  updatePayrollSettings,
  type StatutoryConfig,
} from '../../../api/companyAdmin/payrollSettings';

// Pre-filled with the same current-law defaults as
// Backend/src/config/statutoryDefaults.js — shown here so the form has
// sensible starting values even before a company has ever saved a
// statutoryConfig override (statutory_config starts as {} for every company).
const DEFAULT_PF = { enabled: true, employeeRate: 12, employerRate: 12, wageCeiling: 15000 };
const DEFAULT_ESI = { enabled: true, employeeRate: 0.75, employerRate: 3.25, wageThreshold: 21000 };
const DEFAULT_TDS = {
  enabled: false,
  standardDeduction: 75000,
  cessRate: 4,
  rebate87A: { thresholdTaxableIncome: 700000, maxRebate: 25000 },
};

export function PayrollSettingsForm() {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('payroll_settings:update');

  const [payCycleStartDay, setPayCycleStartDay] = useState(1);
  const [currency, setCurrency] = useState('INR');
  const [enableStatutory, setEnableStatutory] = useState(false);
  const [pf, setPf] = useState(DEFAULT_PF);
  const [esi, setEsi] = useState(DEFAULT_ESI);
  const [ptEnabled, setPtEnabled] = useState(true);
  const [tds, setTds] = useState(DEFAULT_TDS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPayrollSettings();
      setPayCycleStartDay(result.payCycleStartDay);
      setCurrency(result.currency);
      setEnableStatutory(result.enableStatutoryDeductions);
      setPf({ ...DEFAULT_PF, ...result.statutoryConfig?.pf });
      setEsi({ ...DEFAULT_ESI, ...result.statutoryConfig?.esi });
      setPtEnabled(result.statutoryConfig?.pt?.enabled ?? true);
      setTds({
        ...DEFAULT_TDS,
        ...result.statutoryConfig?.tds,
        rebate87A: { ...DEFAULT_TDS.rebate87A, ...result.statutoryConfig?.tds?.rebate87A },
      });
    } catch {
      setError('Could not load payroll settings.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const statutoryConfig: StatutoryConfig = {
        pf,
        esi,
        pt: { enabled: ptEnabled },
        tds,
      };
      await updatePayrollSettings({
        payCycleStartDay,
        currency,
        enableStatutoryDeductions: enableStatutory,
        statutoryConfig,
      });
      setSaved(true);
    } catch {
      setError('Could not save payroll settings.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-5">
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Settings saved.</p>}

      <Input
        id="pay-cycle-start-day"
        label="Pay cycle start day"
        type="number"
        min={1}
        max={28}
        value={payCycleStartDay}
        disabled={!canUpdate}
        onChange={(event) => setPayCycleStartDay(Number(event.target.value))}
      />
      <p className="-mt-2 text-xs text-ink-muted">
        1 means the pay period is the calendar month. Any other day (e.g. 26) makes the pay
        period run from that day of the previous month through the day before it this month.
      </p>

      <Input
        id="payroll-currency"
        label="Currency"
        value={currency}
        disabled={!canUpdate}
        onChange={(event) => setCurrency(event.target.value)}
      />

      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enableStatutory}
          disabled={!canUpdate}
          onChange={(event) => setEnableStatutory(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium text-ink">Enable statutory deductions</span>
          <span className="block text-xs text-ink-muted">
            Automatically deducts PF, ESI, Professional Tax, and TDS on every payroll run using
            the settings below.
          </span>
        </span>
      </label>

      {enableStatutory && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Provident Fund (PF)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Input
                id="pf-employee-rate"
                label="Employee %"
                type="number"
                step="0.01"
                value={pf.employeeRate}
                disabled={!canUpdate}
                onChange={(event) => setPf({ ...pf, employeeRate: Number(event.target.value) })}
              />
              <Input
                id="pf-employer-rate"
                label="Employer %"
                type="number"
                step="0.01"
                value={pf.employerRate}
                disabled={!canUpdate}
                onChange={(event) => setPf({ ...pf, employerRate: Number(event.target.value) })}
              />
              <Input
                id="pf-wage-ceiling"
                label="Wage ceiling"
                type="number"
                value={pf.wageCeiling}
                disabled={!canUpdate}
                onChange={(event) => setPf({ ...pf, wageCeiling: Number(event.target.value) })}
              />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Applies only to salary components marked "Counts toward PF wage" (Basic/DA).
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Employee State Insurance (ESI)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Input
                id="esi-employee-rate"
                label="Employee %"
                type="number"
                step="0.01"
                value={esi.employeeRate}
                disabled={!canUpdate}
                onChange={(event) => setEsi({ ...esi, employeeRate: Number(event.target.value) })}
              />
              <Input
                id="esi-employer-rate"
                label="Employer %"
                type="number"
                step="0.01"
                value={esi.employerRate}
                disabled={!canUpdate}
                onChange={(event) => setEsi({ ...esi, employerRate: Number(event.target.value) })}
              />
              <Input
                id="esi-wage-threshold"
                label="Wage threshold"
                type="number"
                value={esi.wageThreshold}
                disabled={!canUpdate}
                onChange={(event) => setEsi({ ...esi, wageThreshold: Number(event.target.value) })}
              />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Applies only when an employee's gross pay is at or below the wage threshold.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={ptEnabled}
              disabled={!canUpdate}
              onChange={(event) => setPtEnabled(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-ink">Professional Tax (PT)</span>
              <span className="block text-xs text-ink-muted">
                Deducted using each employee's Work State and standard state slab rates. Custom
                slab tables aren't editable here yet — contact support to override a state's
                table.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-1.5 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={tds.enabled}
                disabled={!canUpdate}
                onChange={(event) => setTds({ ...tds, enabled: event.target.checked })}
              />
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Tax Deducted at Source (TDS)
              </span>
            </label>
            {tds.enabled && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    id="tds-standard-deduction"
                    label="Standard deduction"
                    type="number"
                    value={tds.standardDeduction}
                    disabled={!canUpdate}
                    onChange={(event) => setTds({ ...tds, standardDeduction: Number(event.target.value) })}
                  />
                  <Input
                    id="tds-cess-rate"
                    label="Cess %"
                    type="number"
                    step="0.01"
                    value={tds.cessRate}
                    disabled={!canUpdate}
                    onChange={(event) => setTds({ ...tds, cessRate: Number(event.target.value) })}
                  />
                  <Input
                    id="tds-rebate-threshold"
                    label="Section 87A rebate threshold"
                    type="number"
                    value={tds.rebate87A.thresholdTaxableIncome}
                    disabled={!canUpdate}
                    onChange={(event) =>
                      setTds({
                        ...tds,
                        rebate87A: { ...tds.rebate87A, thresholdTaxableIncome: Number(event.target.value) },
                      })
                    }
                  />
                  <Input
                    id="tds-rebate-max"
                    label="Section 87A max rebate"
                    type="number"
                    value={tds.rebate87A.maxRebate}
                    disabled={!canUpdate}
                    onChange={(event) =>
                      setTds({ ...tds, rebate87A: { ...tds.rebate87A, maxRebate: Number(event.target.value) } })
                    }
                  />
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  New Tax Regime only. Slab rates follow current law and aren't editable here.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {canUpdate && (
        <div className="flex justify-end pt-1">
          <Button onClick={handleSave} isLoading={isSaving}>
            Save Settings
          </Button>
        </div>
      )}
    </div>
  );
}
