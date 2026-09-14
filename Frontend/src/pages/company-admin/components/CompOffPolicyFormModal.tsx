import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import {
  createCompOffPolicy,
  updateCompOffPolicy,
  type CompOffPolicy,
} from '../../../api/companyAdmin/compOffPolicies';
import type { Brand } from '../../../api/tenancy';

interface CompOffPolicyFormModalProps {
  policy?: CompOffPolicy;
  // Only passed (and only then does the Brand field render) when the
  // company actually has more than one Brand for the caller to choose
  // between — a brand-scoped caller (Brand Admin) always resolves to
  // exactly 1 from their own listBrands() call, and must never have the
  // field rendered/submitted at all (the backend rejects any brandId from
  // them, even an unchanged one — see brandScope.js::assertBrandReassignAllowed).
  brands?: Brand[];
  onClose: () => void;
  onSaved: (policy: CompOffPolicy) => void;
}

export function CompOffPolicyFormModal({ policy, brands = [], onClose, onSaved }: CompOffPolicyFormModalProps) {
  const isEdit = !!policy;
  const [name, setName] = useState(policy?.name ?? '');
  const [expiryDays, setExpiryDays] = useState(policy ? String(policy.expiryDays) : '90');
  const [carryForward, setCarryForward] = useState(policy?.carryForward ?? false);
  const [brandId, setBrandId] = useState(policy?.brandId ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const input = {
        name: name.trim(),
        expiryDays: Number(expiryDays) || 90,
        carryForward,
        // Only ever sent when the field below is actually rendered/editable
        // (brands.length > 1) — see the brands prop's own comment above.
        ...(brands.length > 1 ? { brandId } : {}),
      };
      const saved = isEdit ? await updateCompOffPolicy(policy.id, input) : await createCompOffPolicy(input);
      onSaved(saved);
      onClose();
    } catch {
      setError(isEdit ? 'Could not update this policy. Please try again.' : 'Could not create this policy. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Comp-Off Policy' : 'Add Comp-Off Policy'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="comp-off-policy-name"
          label="Policy Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Standard Comp-Off"
        />

        {brands.length > 1 && (
          <Select
            id="comp-off-policy-brand"
            label="Brand"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            placeholder="Shared (all brands)"
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={carryForward}
            onChange={(event) => setCarryForward(event.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
          />
          Carry forward — credits never expire
        </label>

        {!carryForward && (
          <Input
            id="comp-off-policy-expiry-days"
            label="Expiry (days after earning)"
            type="number"
            min="1"
            required
            value={expiryDays}
            onChange={(event) => setExpiryDays(event.target.value)}
            placeholder="90"
          />
        )}
        <p className="-mt-2 text-xs text-ink-muted">
          {carryForward
            ? 'An employee on this policy keeps an unused credit indefinitely, until they redeem it.'
            : 'An unused credit expires this many days after the day it was earned.'}
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!name.trim()}>
            {isEdit ? 'Save Changes' : 'Add Policy'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
