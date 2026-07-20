import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { AdminInvitationPanel } from './AdminInvitationPanel';
import {
  getBrandAdminInvitation,
  inviteBrandAdmin,
  updateBrand,
  type AdminInvitation,
  type Brand,
} from '../../../api/tenancy';

interface EditBrandModalProps {
  brand: Brand;
  onClose: () => void;
  onSaved: () => void;
}

export function EditBrandModal({ brand, onClose, onSaved }: EditBrandModalProps) {
  const [name, setName] = useState(brand.name);
  const [code, setCode] = useState(brand.code ?? '');
  const [address, setAddress] = useState(brand.address ?? '');
  const [city, setCity] = useState(brand.city ?? '');
  const [state, setState] = useState(brand.state ?? '');
  const [isActive, setIsActive] = useState(brand.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<AdminInvitation | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getBrandAdminInvitation(brand.id)
      .then((result) => {
        if (!cancelled) setInvitation(result);
      })
      .catch(() => {
        if (!cancelled) setInvitation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [brand.id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (isActive !== brand.isActive && !isActive) {
      if (!window.confirm(`Deactivate "${brand.name}"? Its employees and rosters stay, but the brand will show as inactive.`)) return;
    }
    setIsSubmitting(true);
    try {
      await updateBrand(brand.id, {
        name,
        code: code || null,
        address: address || null,
        city: city || null,
        state: state || null,
        isActive,
      });
      onSaved();
      onClose();
    } catch {
      setError('Could not save changes. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Edit Brand" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input
          id="edit-brand-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          id="edit-brand-code"
          label="Code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Input
          id="edit-brand-address"
          label="Address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="edit-brand-city"
            label="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <Input
            id="edit-brand-state"
            label="State"
            value={state}
            onChange={(event) => setState(event.target.value)}
          />
        </div>
        <Select
          id="edit-brand-active"
          label="Status"
          value={isActive ? 'active' : 'inactive'}
          onChange={(event) => setIsActive(event.target.value === 'active')}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />

        <AdminInvitationPanel
          roleLabel="Brand Admin"
          invitation={invitation}
          onInvite={(email) => inviteBrandAdmin({ brandId: brand.id, email })}
          onInvited={setInvitation}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
