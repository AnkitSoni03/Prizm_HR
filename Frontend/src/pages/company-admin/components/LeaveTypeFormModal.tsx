import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { createLeaveType, listLeaveTypes, updateLeaveType, type LeaveType } from '../../../api/companyAdmin/leaveBalance';
import { apiErrorMessage } from '../../../utils/apiError';
import { useIsBrandAdminPortal } from '../../../hooks/useIsBrandAdminPortal';
import { APPLICABLE_GENDER_OPTIONS } from '../../../utils/gender';
import type { Brand } from '../../../api/tenancy';

interface LeaveTypeFormModalProps {
  leaveType?: LeaveType;
  // Only passed (and only then does the Brand field render) when the
  // company actually has more than one Brand for the caller to choose
  // between — a brand-scoped caller (Brand Admin) always resolves to
  // exactly 1 from their own listBrands() call, and must never have the
  // field rendered/submitted at all (the backend rejects any brandId from
  // them, even an unchanged one — see brandScope.js::assertBrandReassignAllowed).
  brands?: Brand[];
  onClose: () => void;
  onSaved: (leaveType: LeaveType) => void;
}

const CYCLE_OPTIONS = [
  { value: 'calendar', label: 'Calendar Year (resets every Jan 1 – Dec 31)' },
  { value: 'anniversary', label: 'Anniversary Year (resets every year from date of joining)' },
  { value: 'custom', label: 'Custom (admin-defined start date, resets every year)' },
];

const DEDUCTION_OPTIONS = [
  { value: '0.5', label: '0.5 day (half day)' },
  { value: '1', label: '1 day' },
];

const MONTH_OPTIONS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

// Used both as its own "Leave Types" management page (LeaveTypesPage.tsx)
// and as the "+ Add Leave Type" shortcut inside the Add Leave Policy form
// (LeavePolicyFormModal.tsx) — same fields, same endpoint, either way.
export function LeaveTypeFormModal({ leaveType, brands = [], onClose, onSaved }: LeaveTypeFormModalProps) {
  const isEdit = !!leaveType;
  // Company Admin managing a Brand-mode company must always pin every Leave
  // Type to one real Brand — there's no "Shared (all brands)" choice any
  // more. Brand Admin (identified by URL, not brand count — see the hook's
  // own comment) and a direct-mode company (zero Brands) never see this
  // field at all, same as before.
  const isBrandAdminPortal = useIsBrandAdminPortal();
  const showBrandField = !isBrandAdminPortal && brands.length > 0;
  const defaultBrandId = showBrandField ? (brands[0]?.id ?? '') : '';
  const [name, setName] = useState(leaveType?.name ?? '');
  const [code, setCode] = useState(leaveType?.code ?? '');
  const [brandId, setBrandId] = useState(leaveType?.brandId || defaultBrandId);
  const [isPaid, setIsPaid] = useState(leaveType?.isPaid ?? true);
  const [carryForward, setCarryForward] = useState(leaveType?.carryForward ?? false);
  const [maxCarryForwardDays, setMaxCarryForwardDays] = useState(
    leaveType?.maxCarryForwardDays != null ? String(leaveType.maxCarryForwardDays) : ''
  );
  const [cycleType, setCycleType] = useState<LeaveType['cycleType']>(leaveType?.cycleType ?? 'calendar');
  const [applicableGender, setApplicableGender] = useState<LeaveType['applicableGender']>(
    leaveType?.applicableGender ?? 'all'
  );
  const [customCycleStartMonth, setCustomCycleStartMonth] = useState(
    leaveType?.customCycleStartMonth != null ? String(leaveType.customCycleStartMonth) : '4'
  );
  const [customCycleStartDay, setCustomCycleStartDay] = useState(
    leaveType?.customCycleStartDay != null ? String(leaveType.customCycleStartDay) : '1'
  );
  // Optional "Deduct from another leave" link — '' = independent type with
  // its own quota (set on the Leave Policy).
  const [deductFromLeaveTypeId, setDeductFromLeaveTypeId] = useState(leaveType?.deductFromLeaveTypeId ?? '');
  const [deductionPerUse, setDeductionPerUse] = useState(
    leaveType?.deductionPerUse != null ? String(Number(leaveType.deductionPerUse)) : '0.5'
  );
  const [otherLeaveTypes, setOtherLeaveTypes] = useState<LeaveType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listLeaveTypes()
      .then(setOtherLeaveTypes)
      .catch(() => setOtherLeaveTypes([]));
  }, []);

  // Only an ordinary independent type can be a source: not this type, not
  // another linked type (no chains), not comp-off, and — for a Brand-pinned
  // type — only a shared or same-Brand type.
  const sourceOptions = otherLeaveTypes.filter(
    (lt) =>
      lt.id !== leaveType?.id &&
      !lt.deductFromLeaveTypeId &&
      lt.code !== 'CO' &&
      (!brandId || !lt.brandId || lt.brandId === brandId)
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (cycleType === 'custom' && (customCycleStartDay.trim() === '' || Number(customCycleStartDay) < 1 || Number(customCycleStartDay) > 31)) {
      setError('Custom cycle start day must be between 1 and 31.');
      return;
    }
    setIsSubmitting(true);
    try {
      const maxCarryForwardValue =
        carryForward && maxCarryForwardDays.trim() !== '' ? Number(maxCarryForwardDays) : null;
      const cyclePayload =
        cycleType === 'custom'
          ? { customCycleStartMonth: Number(customCycleStartMonth), customCycleStartDay: Number(customCycleStartDay) }
          : { customCycleStartMonth: null, customCycleStartDay: null };
      // Only ever sent when the field below is actually rendered/editable
      // (showBrandField) — see the brands prop's own comment above.
      const brandPatch = showBrandField ? { brandId } : {};
      const linkPayload = deductFromLeaveTypeId
        ? { deductFromLeaveTypeId, deductionPerUse: Number(deductionPerUse) }
        : { deductFromLeaveTypeId: null, deductionPerUse: null };
      let saved: LeaveType;
      if (isEdit) {
        saved = await updateLeaveType(leaveType.id, {
          name: name.trim(),
          isPaid,
          carryForward,
          maxCarryForwardDays: maxCarryForwardValue,
          cycleType,
          applicableGender,
          ...cyclePayload,
          ...brandPatch,
          ...linkPayload,
        });
      } else {
        saved = await createLeaveType({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          isPaid,
          carryForward,
          maxCarryForwardDays: maxCarryForwardValue,
          cycleType,
          applicableGender,
          ...cyclePayload,
          ...brandPatch,
          ...linkPayload,
        });
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(
        apiErrorMessage(
          err,
          isEdit
            ? 'Could not update this leave type. Please try again.'
            : 'Could not create this leave type — the code may already be in use.'
        )
      );
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Leave Type' : 'Add Leave Type'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="leave-type-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Sick Leave"
        />
        <Input
          id="leave-type-code"
          label="Code"
          required
          disabled={isEdit}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="SICK"
        />
        {showBrandField && (
          <Select
            id="leave-type-brand"
            label="Brand"
            required
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(event) => setIsPaid(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
          />
          Paid leave
        </label>

        <Select
          id="leave-type-deduct-from"
          label="Deduct from another leave (optional)"
          value={deductFromLeaveTypeId}
          onChange={(event) => setDeductFromLeaveTypeId(event.target.value)}
          placeholder="None — this leave has its own quota"
          options={sourceOptions.map((lt) => ({ value: lt.id, label: lt.name }))}
        />
        {deductFromLeaveTypeId ? (
          <>
            <Select
              id="leave-type-deduction-per-use"
              label="Deduction per use"
              value={deductionPerUse}
              onChange={(event) => setDeductionPerUse(event.target.value)}
              options={DEDUCTION_OPTIONS}
            />
            <p className="-mt-2 text-xs text-ink-muted">
              Each use is one date and is taken from the{' '}
              {sourceOptions.find((lt) => lt.id === deductFromLeaveTypeId)?.name ?? 'selected'} balance. E.g. with 6
              days left and 0.5 per use, the employee can take 12 of this leave.
              {deductionPerUse === '0.5' && ' The employee picks First Half or Second Half when applying.'}
            </p>
          </>
        ) : (
          <p className="-mt-2 text-xs text-ink-muted">
            Leave empty for an independent leave (e.g. Special Leave) with its own quota.
          </p>
        )}

        <Select
          id="leave-type-applicable-gender"
          label="Applicable To"
          value={applicableGender}
          onChange={(event) => setApplicableGender(event.target.value as LeaveType['applicableGender'])}
          options={APPLICABLE_GENDER_OPTIONS}
        />
        <p className="-mt-2 text-xs text-ink-muted">
          Restrict this leave type to one gender (e.g. Maternity Leave → Female only, Paternity
          Leave → Male only). Employees whose gender doesn't match never see or can apply it.
        </p>

        {/* A linked type has no balance of its own, so cycle/carry-forward don't apply. */}
        {!deductFromLeaveTypeId && (
          <>
            <Select
              id="leave-type-cycle"
              label="Leave Cycle"
              value={cycleType}
              onChange={(event) => setCycleType(event.target.value as LeaveType['cycleType'])}
              options={CYCLE_OPTIONS}
            />
            {cycleType === 'custom' && (
              <div className="flex gap-2">
                <Select
                  id="leave-type-custom-cycle-month"
                  label="Starts every"
                  value={customCycleStartMonth}
                  onChange={(event) => setCustomCycleStartMonth(event.target.value)}
                  options={MONTH_OPTIONS}
                />
                <Input
                  id="leave-type-custom-cycle-day"
                  label="Day"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  value={customCycleStartDay}
                  onChange={(event) => setCustomCycleStartDay(event.target.value)}
                  className="w-24"
                />
              </div>
            )}

            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={carryForward}
                onChange={(event) => setCarryForward(event.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
              />
              Allow carry-forward to next cycle
            </label>
            {carryForward && (
              <Input
                id="leave-type-max-carry-forward"
                label="Max Carry-Forward (days)"
                type="number"
                min="0"
                step="0.5"
                value={maxCarryForwardDays}
                onChange={(event) => setMaxCarryForwardDays(event.target.value)}
                placeholder="Leave blank for unlimited"
              />
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!name.trim() || (!isEdit && !code.trim())}>
            {isEdit ? 'Save Changes' : 'Add Leave Type'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
