import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { assignEmployeePowers, createEmployee, uploadEmployeePhoto } from '../../../api/companyAdmin/employees';
import { createDepartment, createDesignation } from '../../../api/companyAdmin/org';
import { useAuth } from '../../../context/auth-context';
import { useToast } from '../../../context/toast-context';
import { PowerAssignment } from '../../../components/PowerAssignment';
import { PhotoUploadField } from '../../../components/ui/PhotoUploadField';
import type { Brand, Department, Designation, Employee } from '../../../api/tenancy';
import type { RosterPolicyGroup } from '../../../api/companyAdmin/rosterGroups';
import { INDIAN_STATES } from '../../../utils/indianStates';
import { formatEmployeeLabel } from '../../../utils/employeeDisplay';

interface EmployeeFormModalProps {
  brands: Brand[];
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  // Optional — omitted entirely by call sites that don't manage Roster
  // Groups (e.g. Super Admin's employee-creation flow).
  rosterGroups?: RosterPolicyGroup[];
  onClose: () => void;
  onCreated: () => void;
  // Lets the parent's cached lookup lists pick up a department/designation
  // created inline here (via "+ Add new...") without a full refetch, so it's
  // immediately available the next time this or any other form is opened.
  onDepartmentCreated?: (department: Department) => void;
  onDesignationCreated?: (designation: Designation) => void;
}

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'probation', label: 'Probation' },
];

const NEW_OPTION_VALUE = '__new__';

export function EmployeeFormModal({
  brands,
  departments,
  designations,
  employees,
  rosterGroups = [],
  onClose,
  onCreated,
  onDepartmentCreated,
  onDesignationCreated,
}: EmployeeFormModalProps) {
  const { user, hasPermission } = useAuth();
  const showToast = useToast();
  const usesBrands = user?.companyUsesBrands ?? true;
  const canCreateDepartment = hasPermission('department:create');
  const canCreateDesignation = hasPermission('designation:create');
  // Assigning powers is gated on employee:update (same permission the edit
  // modal's own Powers tab uses) — anyone who can already edit an employee
  // can also hand-pick their optional extra capabilities.
  const canAssignPowers = hasPermission('employee:update');

  const [name, setName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [brandId, setBrandId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [newDesignationTitle, setNewDesignationTitle] = useState('');
  const [managerId, setManagerId] = useState('');
  const [rosterGroupId, setRosterGroupId] = useState('');
  const [dateOfJoining, setDateOfJoining] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [employmentType, setEmploymentType] = useState<
    'full_time' | 'part_time' | 'contract' | 'probation'
  >('full_time');
  const [workState, setWorkState] = useState('');
  const [powerKeys, setPowerKeys] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      let resolvedDepartmentId = departmentId;
      if (departmentId === NEW_OPTION_VALUE) {
        const department = await createDepartment({ name: newDepartmentName });
        onDepartmentCreated?.(department);
        resolvedDepartmentId = department.id;
      }

      let resolvedDesignationId = designationId;
      if (designationId === NEW_OPTION_VALUE) {
        const designation = await createDesignation({ title: newDesignationTitle, level: null });
        onDesignationCreated?.(designation);
        resolvedDesignationId = designation.id;
      }

      const employee = await createEmployee({
        name,
        employeeCode,
        brandId: usesBrands ? brandId : undefined,
        departmentId: resolvedDepartmentId,
        designationId: resolvedDesignationId || null,
        managerId: managerId || null,
        rosterGroupId: rosterGroupId || null,
        dateOfJoining,
        dateOfBirth: dateOfBirth || undefined,
        employmentType,
        workState: workState || undefined,
      });

      // The employee already exists at this point — a failure here is a
      // separate, non-blocking concern (surfaced but not conflated with
      // "employee creation failed"). Powers can always be assigned later
      // from the edit modal.
      if (canAssignPowers && powerKeys.length > 0) {
        try {
          await assignEmployeePowers(employee.id, powerKeys);
        } catch {
          showToast(
            `${employee.name ?? employee.employeeCode} was created, but the selected powers could not be assigned. You can assign them from the employee's details.`
          );
        }
      }

      // Same non-blocking treatment as powers — the photo is optional and
      // can always be added later from the edit modal.
      if (photoFile) {
        try {
          await uploadEmployeePhoto(employee.id, photoFile);
        } catch {
          showToast(
            `${employee.name ?? employee.employeeCode} was created, but the photo could not be uploaded. You can add it from the employee's details.`
          );
        }
      }

      onCreated();
      onClose();
    } catch (err) {
      // Backend messages here are specific (roster-mandatory 422, duplicate
      // employeeCode 409, cross-tenant 400) — surface them directly.
      if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
        setError(err.response.data.error);
      } else {
        setError('Could not add the employee. Please try again.');
      }
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add Employee" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}
        <PhotoUploadField previewUrl={null} onSelect={setPhotoFile} />
        <Input
          id="employee-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Jane Doe"
        />
        <Input
          id="employee-code"
          label="Employee Code"
          required
          value={employeeCode}
          onChange={(event) => setEmployeeCode(event.target.value)}
          placeholder="E001"
        />
        {usesBrands && (
          <Select
            id="employee-brand"
            label="Brand"
            required
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            disabled={brands.length === 0}
            placeholder={brands.length === 0 ? 'No brands available' : 'Select a brand'}
            options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
          />
        )}
        <div>
          <Select
            id="employee-department"
            label="Department"
            required
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            disabled={departments.length === 0 && !canCreateDepartment}
            placeholder={
              departments.length === 0 && !canCreateDepartment ? 'Create a department first' : 'Select a department'
            }
            options={[
              ...departments.map((department) => ({ value: department.id, label: department.name })),
              ...(canCreateDepartment ? [{ value: NEW_OPTION_VALUE, label: '+ Add new department…' }] : []),
            ]}
          />
          {departmentId === NEW_OPTION_VALUE && (
            <div className="mt-2">
              <Input
                id="employee-department-new"
                label="New Department Name"
                required
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
                placeholder="e.g. Customer Support"
              />
            </div>
          )}
        </div>
        <div>
          <Select
            id="employee-designation"
            label="Designation"
            value={designationId}
            onChange={(event) => setDesignationId(event.target.value)}
            placeholder="No designation"
            options={[
              ...designations.map((designation) => ({ value: designation.id, label: designation.title })),
              ...(canCreateDesignation ? [{ value: NEW_OPTION_VALUE, label: '+ Add new designation…' }] : []),
            ]}
          />
          {designationId === NEW_OPTION_VALUE && (
            <div className="mt-2">
              <Input
                id="employee-designation-new"
                label="New Designation Title"
                required
                value={newDesignationTitle}
                onChange={(event) => setNewDesignationTitle(event.target.value)}
                placeholder="e.g. Support Lead"
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="employee-doj"
            label="Date of Joining"
            type="date"
            required
            value={dateOfJoining}
            onChange={(event) => setDateOfJoining(event.target.value)}
          />
          <Select
            id="employee-type"
            label="Employment Type"
            required
            value={employmentType}
            onChange={(event) =>
              setEmploymentType(event.target.value as 'full_time' | 'part_time' | 'contract')
            }
            options={EMPLOYMENT_TYPES}
          />
          <Input
            id="employee-dob"
            label="Date of Birth (optional)"
            type="date"
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
          />
        </div>
        <Select
          id="employee-manager"
          label="Manager"
          value={managerId}
          onChange={(event) => setManagerId(event.target.value)}
          placeholder="No manager"
          options={employees.map((employee) => ({
            value: employee.id,
            label: formatEmployeeLabel(employee),
          }))}
        />
        <Select
          id="employee-roster-group"
          label="Roster Group (optional)"
          value={rosterGroupId}
          onChange={(event) => setRosterGroupId(event.target.value)}
          placeholder="None — company/brand-wide defaults"
          options={rosterGroups.map((rg) => ({ value: rg.id, label: rg.name }))}
        />
        <p className="-mt-2 text-xs text-ink-muted">
          Assigns this employee's default shift, region-specific holidays, and leave policy from
          the group in one go.
        </p>
        <Select
          id="employee-work-state"
          label="Work State"
          value={workState}
          onChange={(event) => setWorkState(event.target.value)}
          placeholder="Not set"
          options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
        />
        <p className="-mt-2 text-xs text-ink-muted">
          Used for Professional Tax when statutory deductions are enabled.
        </p>
        {canAssignPowers && (
          <div className="border-t border-border pt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Assign Powers (optional)
            </p>
            <p className="mb-2 text-xs text-ink-muted">
              Hand-pick extra capabilities for this employee, independent of their role.
            </p>
            <PowerAssignment selectedKeys={powerKeys} onChange={setPowerKeys} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={
              (departments.length === 0 && !canCreateDepartment) || (usesBrands && brands.length === 0)
            }
          >
            Add Employee
          </Button>
        </div>
      </form>
    </Modal>
  );
}
