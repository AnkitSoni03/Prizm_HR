import { useEffect, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../context/auth-context';
import { getPayrollSettings, updatePayrollSettings } from '../../../api/companyAdmin/payrollSettings';

export function PayrollSettingsForm() {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('payroll_settings:update');

  const [payCycleStartDay, setPayCycleStartDay] = useState(1);
  const [currency, setCurrency] = useState('INR');
  const [enableStatutory, setEnableStatutory] = useState(false);
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
      await updatePayrollSettings({
        payCycleStartDay,
        currency,
        enableStatutoryDeductions: enableStatutory,
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
    <div className="max-w-lg space-y-4 rounded-xl border border-border bg-card p-5">
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
            Reserved for PF / ESI / Professional Tax / TDS — not yet calculated automatically.
            Toggling this only records the company's intent for now.
          </span>
        </span>
      </label>

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
