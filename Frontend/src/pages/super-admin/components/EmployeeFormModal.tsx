import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../context/auth-context';
import { useToast } from '../../../context/toast-context';
import { PhotoUploadField } from '../../../components/ui/PhotoUploadField';
import {
  createDepartment,
  createDesignation,
  createEmployee,
  uploadEmployeePhoto,
  type Department,
  type Designation,
  type Employee,
} from '../../../api/tenancy';

interface EmployeeFormModalProps {
  companyId: string;
  brandId?: string;
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
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
];

const NEW_OPTION_VALUE = '__new__';

export function EmployeeFormModal({
  companyId,
  brandId,
  departments,
  designations,
  employees,
  onClose,
  onCreated,
  onDepartmentCreated,
  onDesignationCreated,
}: EmployeeFormModalProps) {
  const { hasPermission } = useAuth();
  const showToast = useToast();
  const canCreateDepartment = hasPermission('department:create');
  const canCreateDesignation = hasPermission('designation:create');

  const [name, setName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [newDesignationTitle, setNewDesignationTitle] = useState('');
  const [managerId, setManagerId] = useState('');
  const [dateOfJoining, setDateOfJoining] = useState('');
  const [employmentType, setEmploymentType] = useState<'full_time' | 'part_time' | 'contract'>(
    'full_time'
  );
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
        const department = await createDepartment({ companyId, name: newDepartmentName, code: '' });
        onDepartmentCreated?.(department);
        resolvedDepartmentId = department.id;
      }

      let resolvedDesignationId = designationId;
      if (designationId === NEW_OPTION_VALUE) {
        const designation = await createDesignation({ companyId, title: newDesignationTitle, level: null });
        onDesignationCreated?.(designation);
        resolvedDesignationId = designation.id;
      }

      const employee = await createEmployee({
        companyId,
        name,
        employeeCode,
        brandId,
        departmentId: resolvedDepartmentId,
        designationId: resolvedDesignationId || null,
        managerId: managerId || null,
        dateOfJoining,
        employmentType,
      });

      // Non-blocking, same as elsewhere — the employee already exists at
      // this point, so a photo upload failure shouldn't be conflated with
      // "employee creation failed".
      if (photoFile) {
        try {
          await uploadEmployeePhoto(employee.id, photoFile);
        } catch {
          showToast(
            `${employee.name ?? employee.employeeCode} was created, but the photo could not be uploaded.`
          );
        }
      }

      onCreated();
      onClose();
    } catch (err) {
      // The backend's own messages are already specific (roster-mandatory
      // 422, cross-tenant 400s, duplicate employeeCode 409) — surface them
      // directly instead of a generic fallback, per the roster-mandatory
      // gate being the one error this form is explicitly meant to explain
      // clearly rather than as a raw failure.
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
        </div>
        <Select
          id="employee-manager"
          label="Manager"
          value={managerId}
          onChange={(event) => setManagerId(event.target.value)}
          placeholder="No manager"
          options={employees.map((employee) => ({
            value: employee.id,
            label: `${employee.name} (${employee.employeeCode})`,
          }))}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={departments.length === 0 && !canCreateDepartment}
          >
            Add Employee
          </Button>
        </div>
      </form>
    </Modal>
  );
}
