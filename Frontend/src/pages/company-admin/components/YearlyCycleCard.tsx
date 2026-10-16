import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/toast-context';
import { useIsBrandAdminPortal } from '../../../hooks/useIsBrandAdminPortal';
import { getYearlyCycle, updateYearlyCycle } from '../../../api/companyAdmin/leavePolicies';
import { YEARLY_CYCLE_OPTIONS, yearlyCycleLabel } from '../../../utils/yearlyCycle';
import { apiErrorMessage } from '../../../utils/apiError';

// Company default "Yearly Roster Update" — the month the yearly leave cycle
// starts on. Balances renew on the 1st of that month with carry-forward
// (capped per leave type); employees in Probation / Intern renew only after
// their period ends. Each employee can override it on their profile.
// Company-wide, so a Brand Admin only sees it.
export function YearlyCycleCard({ canUpdate }: { canUpdate: boolean }) {
  const showToast = useToast();
  const isBrandAdminPortal = useIsBrandAdminPortal();
  const editable = canUpdate && !isBrandAdminPortal;
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getYearlyCycle()
      .then((res) => {
        setSaved(res.yearlyCycleStartMonth);
        setValue(String(res.yearlyCycleStartMonth));
      })
      .catch(() => setSaved(null));
  }, []);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await updateYearlyCycle(Number(value));
      setSaved(res.yearlyCycleStartMonth);
      showToast(`Yearly Roster Update set to ${yearlyCycleLabel(res.yearlyCycleStartMonth)}.`, 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not save the yearly cycle.'), 'error');
    } finally {
      setIsSaving(false);
    }
  }

  if (saved === null) return null;

  return (
    <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
          <RotateCw className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Yearly Roster Update</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Leave balances renew every year from this month, carrying forward up to each leave type's limit.
            Probation / Intern employees renew only after their period ends. An employee's own setting (on their
            profile) overrides this.
          </p>
        </div>
      </div>
      {editable ? (
        <div className="flex shrink-0 items-end gap-2">
          <div className="w-40">
            <Select
              id="company-yearly-cycle"
              aria-label="Yearly Roster Update"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              options={YEARLY_CYCLE_OPTIONS}
            />
          </div>
          <Button onClick={handleSave} isLoading={isSaving} disabled={Number(value) === saved}>
            Save
          </Button>
        </div>
      ) : (
        <p className="shrink-0 text-sm font-medium text-ink">{yearlyCycleLabel(saved)}</p>
      )}
    </div>
  );
}
