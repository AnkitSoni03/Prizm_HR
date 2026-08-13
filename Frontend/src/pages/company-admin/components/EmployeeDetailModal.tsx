import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Check, CheckCircle2, Copy, FileText, Pencil, Trash2, X } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Tabs } from '../../../components/ui/Tabs';
import { RejectReasonModal } from '../../../components/RejectReasonModal';
import { useAuth } from '../../../context/auth-context';
import { useConfirm } from '../../../context/confirm-context';
import { useToast } from '../../../context/toast-context';
import {
  assignEmployeePowers,
  getEmployee,
  updateEmployee,
  transferEmployee,
  inviteEmployeeUser,
  transferEmployeeLogin,
  setEmployeeActive,
  deleteEmployee,
  uploadEmployeePhoto,
  removeEmployeePhoto,
} from '../../../api/companyAdmin/employees';
import { PhotoUploadField } from '../../../components/ui/PhotoUploadField';
import { FileUploadField } from '../../../components/ui/FileUploadField';
import { FilePreviewModal } from '../../../components/ui/FilePreviewModal';
import { Avatar } from '../../../components/ui/Avatar';
import {
  listEmployeeDocuments,
  uploadEmployeeDocument,
  updateEmployeeDocument,
  deleteEmployeeDocument,
  verifyEmployeeDocument,
  rejectEmployeeDocument,
  listDocumentRequests,
  createDocumentRequest,
  cancelDocumentRequest,
  type EmployeeDocument,
  type DocumentUploadRequest,
} from '../../../api/companyAdmin/employeeDocuments';
import {
  adjustLeaveBalance,
  listLeaveBalances,
  listLeaveTypes,
  type LeaveBalance,
  type LeaveType,
} from '../../../api/companyAdmin/leaveBalance';
import { listPowers } from '../../../api/powers';
import { PowerAssignment } from '../../../components/PowerAssignment';
import type { Brand, Department, Designation, Employee, Shift } from '../../../api/tenancy';
import { INDIAN_STATES } from '../../../utils/indianStates';
import { holidayAuditName } from '../../../api/companyAdmin/holidays';
import { formatDisplayDateTime, formatDisplayDate } from '../../../utils/dateDisplay';
import {
  listShifts,
  listEmployeeShiftAssignments,
  assignEmployeeShift,
  deleteEmployeeShiftAssignment,
  type EmployeeShiftAssignment,
} from '../../../api/companyAdmin/attendance';

interface EmployeeDetailModalProps {
  employee: Employee;
  brands: Brand[];
  departments: Department[];
  designations: Designation[];
  employees: Employee[];
  onClose: () => void;
  onUpdated: () => void;
  // Separate from onUpdated (which also closes this modal, e.g. after
  // saving Details/Transfer) — a photo change should refresh the parent's
  // list (so its avatar picks up the new photo) without closing this modal.
  onPhotoChanged?: () => void;
  // Which tab to open on. Defaults to 'details'; the ESS Document
  // Verification page (a power-holder with no employee:update) opens
  // straight to 'documents' since that's the only tab it cares about.
  initialTab?: 'details' | 'documents' | 'leaveBalance' | 'powers';
}

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'probation', label: 'Probation' },
];

const STATUS_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'on_notice', label: 'On Notice' },
  { value: 'exited', label: 'Exited' },
  { value: 'archived', label: 'Archived' },
];

function statusTone(status: Employee['status']) {
  if (status === 'active') return 'success';
  if (status === 'onboarding' || status === 'on_notice') return 'warning';
  return 'neutral';
}

function docStatusTone(status: EmployeeDocument['status']) {
  if (status === 'verified') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'warning' as const;
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.error === 'string') {
    return err.response.data.error;
  }
  return fallback;
}

export function EmployeeDetailModal({
  employee,
  brands,
  departments,
  designations,
  employees,
  onClose,
  onUpdated,
  onPhotoChanged,
  initialTab = 'details',
}: EmployeeDetailModalProps) {
  const { user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
  const usesBrands = user?.companyUsesBrands ?? true;
  const canUpdate = hasPermission('employee:update');
  const canTransfer = hasPermission('employee:transfer');
  const canDelete = hasPermission('employee:delete');
  const canReadDocs = hasPermission('employee_document:read');
  const canUploadDocs = hasPermission('employee_document:upload');
  const canVerifyDocs = hasPermission('employee_document:verify');
  const canInviteEss = hasPermission('user:invite');
  const canReadLeaveBalance = hasPermission('leave_balance:read');
  const canAdjustLeaveBalance = hasPermission('leave_balance:adjust');
  const canCreateEmployeeShift = hasPermission('employee_shift:create');
  const canReadEmployeeShift = hasPermission('employee_shift:read');
  const canDeleteEmployeeShift = hasPermission('employee_shift:delete');

  const [activeTab, setActiveTab] = useState<'details' | 'documents' | 'leaveBalance' | 'powers'>(initialTab);

  const [photoDownloadUrl, setPhotoDownloadUrl] = useState(employee.photoDownloadUrl ?? null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const [designationId, setDesignationId] = useState(employee.designationId ?? '');
  const [managerId, setManagerId] = useState(employee.managerId ?? '');
  const [dateOfJoining, setDateOfJoining] = useState(employee.dateOfJoining ?? '');
  const [employmentType, setEmploymentType] = useState(employee.employmentType);
  const [status, setStatus] = useState(employee.status);
  const [workState, setWorkState] = useState(employee.workState ?? '');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [transferBrandId, setTransferBrandId] = useState(employee.brandId ?? '');
  const [transferDepartmentId, setTransferDepartmentId] = useState(employee.departmentId);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const [essEmail, setEssEmail] = useState('');
  const [isInvitingEss, setIsInvitingEss] = useState(false);
  const [essInviteError, setEssInviteError] = useState<string | null>(null);
  const [essActivationToken, setEssActivationToken] = useState<string | null>(null);
  const [isEssLinkCopied, setIsEssLinkCopied] = useState(false);

  const essActivationUrl = essActivationToken
    ? `${window.location.origin}/activate?token=${encodeURIComponent(essActivationToken)}`
    : null;

  // employee.loginUser is only eager-loaded by GET /employees/:id — the
  // `employee` prop comes from the list view, which doesn't include it, so
  // it's fetched here once when this employee actually has a linked login.
  const [linkedUser, setLinkedUser] = useState<Employee['loginUser']>(undefined);
  const [isAccountActive, setIsAccountActive] = useState(employee.isActive);
  const [isTogglingAccount, setIsTogglingAccount] = useState(false);

  const [isTransferFormOpen, setIsTransferFormOpen] = useState(false);
  const [transferLoginEmail, setTransferLoginEmail] = useState('');
  const [isTransferringLogin, setIsTransferringLogin] = useState(false);
  const [transferLoginError, setTransferLoginError] = useState<string | null>(null);
  const [transferActivationToken, setTransferActivationToken] = useState<string | null>(null);
  const [isTransferLinkCopied, setIsTransferLinkCopied] = useState(false);

  const transferActivationUrl = transferActivationToken
    ? `${window.location.origin}/activate?token=${encodeURIComponent(transferActivationToken)}`
    : null;

  useEffect(() => {
    if (!canInviteEss || !employee.userId) return;
    let cancelled = false;
    getEmployee(employee.id)
      .then((full) => {
        if (!cancelled) setLinkedUser(full.loginUser ?? null);
      })
      .catch(() => {
        if (!cancelled) setLinkedUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canInviteEss, employee.id, employee.userId]);

  // defaultShift/todayRoster (resolved server-side "as of today") aren't on
  // the list-view `employee` prop — same reason customRole/loginUser above
  // need their own fetch of the full GET /employees/:id record.
  const [shiftSummary, setShiftSummary] = useState<
    Pick<Employee, 'defaultShift' | 'todayRoster'> | undefined
  >(undefined);

  function refreshShiftSummary() {
    getEmployee(employee.id)
      .then((full) => setShiftSummary({ defaultShift: full.defaultShift ?? null, todayRoster: full.todayRoster ?? null }))
      .catch(() => setShiftSummary({ defaultShift: null, todayRoster: null }));
  }

  useEffect(() => {
    refreshShiftSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id]);

  const [shiftOptions, setShiftOptions] = useState<Shift[]>([]);
  useEffect(() => {
    if (!canCreateEmployeeShift) return;
    listShifts().then(setShiftOptions).catch(() => {});
  }, [canCreateEmployeeShift]);

  const [shiftHistory, setShiftHistory] = useState<EmployeeShiftAssignment[] | null>(null);
  useEffect(() => {
    if (!canReadEmployeeShift) return;
    listEmployeeShiftAssignments(employee.id)
      .then(setShiftHistory)
      .catch(() => setShiftHistory([]));
  }, [canReadEmployeeShift, employee.id]);

  const [assignShiftId, setAssignShiftId] = useState('');
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState('');
  const [isAssigningShift, setIsAssigningShift] = useState(false);
  const [assignShiftError, setAssignShiftError] = useState<string | null>(null);

  async function handleAssignShift(event: FormEvent) {
    event.preventDefault();
    if (!assignShiftId || !assignEffectiveFrom) return;
    setAssignShiftError(null);
    setIsAssigningShift(true);
    try {
      const created = await assignEmployeeShift(employee.id, {
        shiftId: assignShiftId,
        effectiveFrom: assignEffectiveFrom,
      });
      setShiftHistory((prev) => (prev ? [created, ...prev] : [created]));
      refreshShiftSummary();
      setAssignShiftId('');
      setAssignEffectiveFrom('');
    } catch (err) {
      setAssignShiftError(extractError(err, 'Could not assign this shift. Please try again.'));
    } finally {
      setIsAssigningShift(false);
    }
  }

  async function handleDeleteShiftAssignment(assignment: EmployeeShiftAssignment) {
    const confirmed = await confirm({
      title: 'Delete shift assignment',
      message: `Delete the ${assignment.shift?.name ?? 'shift'} assignment effective ${formatDisplayDate(assignment.effectiveFrom)}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteEmployeeShiftAssignment(employee.id, assignment.id);
      setShiftHistory((prev) => (prev ? prev.filter((a) => a.id !== assignment.id) : prev));
      refreshShiftSummary();
    } catch {
      showToast('Could not delete this shift assignment. Please try again.');
    }
  }

  // Soft toggle — never deletes the employee. Deactivating also blocks their
  // ESS login immediately (see employee.service.js::setEmployeeActiveStatus);
  // reactivating (e.g. a rejoin) restores both in one step.
  async function handleToggleAccount() {
    const nextActive = !isAccountActive;
    const confirmed = await confirm({
      title: nextActive ? 'Activate employee account' : 'Deactivate employee account',
      message: nextActive
        ? `Reactivate ${employee.name ?? employee.employeeCode}'s account? Their ESS login (if any) will regain access immediately.`
        : `Deactivate ${employee.name ?? employee.employeeCode}'s account? Their ESS login (if any) will immediately lose access. No data is deleted, and this can be reversed any time.`,
      confirmLabel: nextActive ? 'Activate' : 'Deactivate',
      variant: nextActive ? 'primary' : 'danger',
    });
    if (!confirmed) return;
    setIsTogglingAccount(true);
    try {
      await setEmployeeActive(employee.id, nextActive);
      setIsAccountActive(nextActive);
      setLinkedUser((prev) => (prev ? { ...prev, isActive: nextActive } : prev));
    } catch {
      showToast("Could not update this employee's account status. Please try again.");
    } finally {
      setIsTogglingAccount(false);
    }
  }

  const [isDeleting, setIsDeleting] = useState(false);

  // Irreversible — unlike handleToggleAccount above (a reversible on/off
  // switch), this actually erases the Employee row and every record tied to
  // it (attendance, leave/OD/regularization/comp-off, documents, payroll,
  // face profile) plus their attendance videos on cloud storage. See
  // employee.service.js::deleteEmployee for exactly what gets removed.
  async function handleDeletePermanently() {
    const confirmed = await confirm({
      title: 'Delete employee permanently',
      message: `Permanently delete ${employee.name ?? employee.employeeCode}? This erases their attendance history (including recorded attendance videos on the cloud), leave/OD/regularization/comp-off records, documents, and payroll data. This cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await deleteEmployee(employee.id);
      onUpdated();
    } catch (err) {
      showToast(extractError(err, 'Could not delete this employee. Please try again.'));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCopyTransferActivationUrl() {
    if (!transferActivationUrl) return;
    await navigator.clipboard.writeText(transferActivationUrl);
    setIsTransferLinkCopied(true);
    setTimeout(() => setIsTransferLinkCopied(false), 2000);
  }

  // Doesn't call onUpdated() — same reasoning as handleInviteEss below, so
  // the success message/activation link stays visible instead of vanishing.
  async function handleTransferLogin(event: FormEvent) {
    event.preventDefault();
    setTransferLoginError(null);
    setIsTransferringLogin(true);
    try {
      const result = await transferEmployeeLogin(employee.id, transferLoginEmail);
      setTransferActivationToken(result.activationToken ?? null);
      // The new User row defaults isActive: true — it just hasn't been
      // activated (status stays 'invited' until the link is used).
      setLinkedUser({ id: result.user.id, email: result.user.email, isActive: true, status: result.user.status });
    } catch (err) {
      setTransferLoginError(extractError(err, 'Could not transfer this login. Please try again.'));
    } finally {
      setIsTransferringLogin(false);
    }
  }

  const [documents, setDocuments] = useState<EmployeeDocument[] | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [docType, setDocType] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'documents' || documents !== null || !canReadDocs) return;
    listEmployeeDocuments(employee.id)
      .then(setDocuments)
      .catch(() => setDocsError('Could not load documents.'));
  }, [activeTab, documents, canReadDocs, employee.id]);

  const [documentRequests, setDocumentRequests] = useState<DocumentUploadRequest[] | null>(null);
  const [requestDocType, setRequestDocType] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [isRequestingDoc, setIsRequestingDoc] = useState(false);
  const [requestDocError, setRequestDocError] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'documents' || documentRequests !== null || !canVerifyDocs) return;
    listDocumentRequests(employee.id)
      .then(setDocumentRequests)
      .catch(() => setDocumentRequests([]));
  }, [activeTab, documentRequests, canVerifyDocs, employee.id]);

  async function handleRequestDocument(event: FormEvent) {
    event.preventDefault();
    if (!requestDocType) return;
    setRequestDocError(null);
    setIsRequestingDoc(true);
    try {
      const request = await createDocumentRequest(employee.id, {
        documentType: requestDocType,
        note: requestNote || undefined,
      });
      setDocumentRequests((prev) => [request, ...(prev ?? [])]);
      setRequestDocType('');
      setRequestNote('');
    } catch (err) {
      setRequestDocError(extractError(err, 'Could not send this request. Please try again.'));
    } finally {
      setIsRequestingDoc(false);
    }
  }

  async function handleCancelRequest(request: DocumentUploadRequest) {
    setCancellingRequestId(request.id);
    try {
      const updated = await cancelDocumentRequest(employee.id, request.id);
      setDocumentRequests((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
    } catch {
      showToast('Could not cancel this request. Please try again.');
    } finally {
      setCancellingRequestId(null);
    }
  }

  const [leaveBalanceYear, setLeaveBalanceYear] = useState(new Date().getFullYear());
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [isLoadingLeaveBalances, setIsLoadingLeaveBalances] = useState(false);
  const [leaveBalanceError, setLeaveBalanceError] = useState<string | null>(null);
  const [draftAllotted, setDraftAllotted] = useState<Record<string, string>>({});
  const [savingLeaveTypeId, setSavingLeaveTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'leaveBalance' || !canReadLeaveBalance) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingLeaveBalances(true);
    setLeaveBalanceError(null);
    Promise.all([listLeaveTypes(), listLeaveBalances({ employeeId: employee.id, year: leaveBalanceYear })])
      .then(([types, balances]) => {
        setLeaveTypes(types);
        setLeaveBalances(balances);
        setDraftAllotted(
          Object.fromEntries(
            types.map((type) => {
              const existing = balances.find((balance) => balance.leaveTypeId === type.id);
              return [type.id, existing ? String(existing.allotted) : ''];
            })
          )
        );
      })
      .catch(() => setLeaveBalanceError('Could not load leave balances.'))
      .finally(() => setIsLoadingLeaveBalances(false));
  }, [activeTab, canReadLeaveBalance, employee.id, leaveBalanceYear]);

  const [powerKeys, setPowerKeys] = useState<string[]>([]);
  const [isSavingPowers, setIsSavingPowers] = useState(false);
  const [powersError, setPowersError] = useState<string | null>(null);
  const [powersSuccess, setPowersSuccess] = useState(false);

  useEffect(() => {
    if (activeTab !== 'powers' || !canUpdate) return;
    // The `employee` prop comes from the list view (no customRole
    // eager-load) — fetch the full record here instead, which does
    // eager-load customRole + its permissions (see
    // employee.service.js::getEmployeeForRead), so the checkboxes pre-check
    // whichever catalog keys are already granted.
    Promise.all([listPowers(), getEmployee(employee.id)])
      .then(([catalog, freshEmployee]) => {
        const grantedCodes = new Set((freshEmployee.customRole?.permissions ?? []).map((p) => p.code));
        setPowerKeys(
          catalog
            .filter((power) => power.permissionCodes.every((code) => grantedCodes.has(code)))
            .map((power) => power.key)
        );
      })
      .catch(() => setPowersError('Could not load current powers.'));
  }, [activeTab, canUpdate, employee.id]);

  // Doesn't call onUpdated() — same reasoning as the ESS-invite section
  // below (that also closes the modal), so the success message stays
  // visible instead of vanishing immediately.
  async function handleSavePowers() {
    setPowersError(null);
    setPowersSuccess(false);
    setIsSavingPowers(true);
    try {
      await assignEmployeePowers(employee.id, powerKeys);
      setPowersSuccess(true);
    } catch (err) {
      setPowersError(extractError(err, 'Could not save powers. Please try again.'));
    } finally {
      setIsSavingPowers(false);
    }
  }

  async function handleAdjustLeaveBalance(event: FormEvent, leaveTypeId: string) {
    event.preventDefault();
    const raw = draftAllotted[leaveTypeId];
    const allotted = Number(raw);
    if (raw === undefined || raw === '' || Number.isNaN(allotted) || allotted < 0) return;
    setLeaveBalanceError(null);
    setSavingLeaveTypeId(leaveTypeId);
    try {
      const updated = await adjustLeaveBalance({
        employeeId: employee.id,
        leaveTypeId,
        year: leaveBalanceYear,
        allotted,
      });
      setLeaveBalances((prev) => [...prev.filter((balance) => balance.leaveTypeId !== leaveTypeId), updated]);
    } catch (err) {
      setLeaveBalanceError(extractError(err, 'Could not update this leave balance.'));
    } finally {
      setSavingLeaveTypeId(null);
    }
  }

  async function handlePhotoSelect(file: File) {
    setIsSavingPhoto(true);
    try {
      const updated = await uploadEmployeePhoto(employee.id, file);
      setPhotoDownloadUrl(updated.photoDownloadUrl ?? null);
      onPhotoChanged?.();
    } catch {
      showToast('Could not upload the photo. Please try again.');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  async function handlePhotoRemove() {
    setIsSavingPhoto(true);
    try {
      const updated = await removeEmployeePhoto(employee.id);
      setPhotoDownloadUrl(updated.photoDownloadUrl ?? null);
      onPhotoChanged?.();
    } catch {
      showToast('Could not remove the photo. Please try again.');
    } finally {
      setIsSavingPhoto(false);
    }
  }

  async function handleSaveDetails(event: FormEvent) {
    event.preventDefault();
    setDetailsError(null);
    setIsSavingDetails(true);
    try {
      await updateEmployee(employee.id, {
        designationId: designationId || null,
        employmentType,
        status,
        dateOfJoining: dateOfJoining || null,
        managerId: managerId || null,
        workState: workState || null,
      });
      onUpdated();
    } catch (err) {
      setDetailsError(extractError(err, 'Could not save changes. Please try again.'));
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleTransfer(event: FormEvent) {
    event.preventDefault();
    setTransferError(null);
    setIsTransferring(true);
    try {
      await transferEmployee(employee.id, {
        brandId: usesBrands && transferBrandId !== (employee.brandId ?? '') ? transferBrandId : undefined,
        departmentId: transferDepartmentId !== employee.departmentId ? transferDepartmentId : undefined,
      });
      onUpdated();
    } catch (err) {
      setTransferError(extractError(err, 'Could not transfer this employee. Please try again.'));
    } finally {
      setIsTransferring(false);
    }
  }

  async function handleCopyEssActivationUrl() {
    if (!essActivationUrl) return;
    await navigator.clipboard.writeText(essActivationUrl);
    setIsEssLinkCopied(true);
    setTimeout(() => setIsEssLinkCopied(false), 2000);
  }

  // Doesn't call onUpdated() — that also closes the modal (see EmployeesPage),
  // which would hide the activation link right after it's produced. The
  // employee list picks up the new userId next time it's reloaded.
  async function handleInviteEss(event: FormEvent) {
    event.preventDefault();
    setEssInviteError(null);
    setIsInvitingEss(true);
    try {
      const result = await inviteEmployeeUser(employee.id, essEmail);
      setEssActivationToken(result.activationToken ?? null);
    } catch (err) {
      setEssInviteError(extractError(err, 'Could not send the invite. Please try again.'));
    } finally {
      setIsInvitingEss(false);
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!docType || !docFile) return;
    setDocsError(null);
    setIsUploading(true);
    try {
      const doc = await uploadEmployeeDocument(employee.id, { type: docType, file: docFile });
      setDocuments((prev) => (prev ? [...prev, doc] : [doc]));
      setDocType('');
      setDocFile(null);
    } catch (err) {
      setDocsError(extractError(err, 'Could not upload this document. Please try again.'));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleVerify(doc: EmployeeDocument) {
    try {
      const updated = await verifyEmployeeDocument(employee.id, doc.id);
      setDocuments((prev) => (prev ? prev.map((d) => (d.id === updated.id ? updated : d)) : prev));
    } catch {
      showToast('Could not verify this document.');
    }
  }

  const [rejectingDoc, setRejectingDoc] = useState<EmployeeDocument | null>(null);

  async function handleRejectConfirm(reason: string) {
    if (!rejectingDoc) return;
    const updated = await rejectEmployeeDocument(employee.id, rejectingDoc.id, reason);
    setDocuments((prev) => (prev ? prev.map((d) => (d.id === updated.id ? updated : d)) : prev));
    setRejectingDoc(null);
  }

  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocType, setEditingDocType] = useState('');
  const [isSavingDocType, setIsSavingDocType] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  function handleStartEditDoc(doc: EmployeeDocument) {
    setEditingDocId(doc.id);
    setEditingDocType(doc.type);
  }

  async function handleSaveDocType(doc: EmployeeDocument) {
    if (!editingDocType.trim() || editingDocType === doc.type) {
      setEditingDocId(null);
      return;
    }
    setIsSavingDocType(true);
    try {
      const updated = await updateEmployeeDocument(employee.id, doc.id, editingDocType.trim());
      setDocuments((prev) => (prev ? prev.map((d) => (d.id === updated.id ? updated : d)) : prev));
      setEditingDocId(null);
    } catch {
      showToast('Could not update this document. Please try again.');
    } finally {
      setIsSavingDocType(false);
    }
  }

  async function handleDeleteDoc(doc: EmployeeDocument) {
    const confirmed = await confirm({
      title: 'Delete document',
      message: `Delete "${doc.type}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeletingDocId(doc.id);
    try {
      await deleteEmployeeDocument(employee.id, doc.id);
      setDocuments((prev) => (prev ? prev.filter((d) => d.id !== doc.id) : prev));
    } catch {
      showToast('Could not delete this document. Please try again.');
    } finally {
      setDeletingDocId(null);
    }
  }

  return (
    <>
      <Modal
        title={employee.name ?? employee.employeeCode}
        onClose={onClose}
        widthClassName="max-w-2xl"
      tabs={
        <Tabs
          items={[
            { key: 'details', label: 'Details' },
            { key: 'documents', label: 'Documents' },
            { key: 'leaveBalance', label: 'Leave Balance' },
            { key: 'powers', label: 'Powers' },
          ]}
          active={activeTab}
          onChange={(key) => setActiveTab(key as 'details' | 'documents' | 'leaveBalance' | 'powers')}
        />
      }
    >
      {activeTab === 'details' && (
        <div className="space-y-6">
          {canUpdate ? (
            <PhotoUploadField
              previewUrl={photoDownloadUrl}
              onSelect={handlePhotoSelect}
              onRemove={photoDownloadUrl ? handlePhotoRemove : undefined}
              isBusy={isSavingPhoto}
            />
          ) : (
            <div className="flex items-center gap-4">
              <Avatar src={photoDownloadUrl} size="xl" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-border bg-page px-4 py-3 text-sm">
            <p className="text-ink-muted">Employee Code</p>
            <p className="text-ink">{employee.employeeCode}</p>
            {usesBrands && (
              <>
                <p className="text-ink-muted">Brand</p>
                <p className="text-ink">{brands.find((b) => b.id === employee.brandId)?.name ?? '—'}</p>
              </>
            )}
            <p className="text-ink-muted">Department</p>
            <p className="text-ink">
              {departments.find((d) => d.id === employee.departmentId)?.name ?? '—'}
            </p>
            <p className="text-ink-muted">Status</p>
            <p>
              <Badge tone={statusTone(employee.status)}>{employee.status}</Badge>
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-page px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">Account Status</p>
              <p className="text-xs text-ink-muted">
                {isAccountActive
                  ? 'This employee is active. Their ESS login (if any) can log in normally.'
                  : 'This employee is deactivated. Their ESS login (if any) cannot log in. No data was deleted.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={isAccountActive ? 'success' : 'danger'}>
                {isAccountActive ? 'Active' : 'Inactive'}
              </Badge>
              {canUpdate && (
                <Button
                  type="button"
                  variant={isAccountActive ? 'danger' : 'secondary'}
                  isLoading={isTogglingAccount}
                  onClick={handleToggleAccount}
                >
                  {isAccountActive ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </div>
          </div>

          {shiftSummary && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Shift &amp; Roster</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-page px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Default Shift</p>
                  {shiftSummary.defaultShift ? (
                    <p className="mt-1 text-sm text-ink">
                      {shiftSummary.defaultShift.name} · {shiftSummary.defaultShift.startTime.slice(0, 5)}–
                      {shiftSummary.defaultShift.endTime.slice(0, 5)}
                      {shiftSummary.defaultShift.isNightShift && (
                        <span className="ml-1.5 text-xs text-ink-muted">(Night Shift)</span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink-muted">Not assigned yet</p>
                  )}
                </div>
                <div className="rounded-lg border border-border bg-page px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Today&apos;s Roster</p>
                  {shiftSummary.todayRoster?.shift ? (
                    <p className="mt-1 text-sm text-ink">
                      {shiftSummary.todayRoster.shift.name} · {shiftSummary.todayRoster.shift.startTime.slice(0, 5)}–
                      {shiftSummary.todayRoster.shift.endTime.slice(0, 5)}
                      {shiftSummary.defaultShift && shiftSummary.todayRoster.shift.id !== shiftSummary.defaultShift.id && (
                        <span className="ml-1.5 text-xs text-warning">(overrides default)</span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink-muted">Following default shift</p>
                  )}
                </div>
              </div>

              {canCreateEmployeeShift && (
                <form onSubmit={handleAssignShift} className="space-y-3">
                  {assignShiftError && <p className="text-sm text-danger">{assignShiftError}</p>}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Select
                      id="employee-assign-shift"
                      label="Shift"
                      value={assignShiftId}
                      onChange={(event) => setAssignShiftId(event.target.value)}
                      disabled={shiftOptions.length === 0}
                      placeholder={shiftOptions.length === 0 ? 'Create a shift first' : 'Select a shift'}
                      options={shiftOptions.map((shift) => ({
                        value: shift.id,
                        label: `${shift.name} (${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)})`,
                      }))}
                    />
                    <Input
                      id="employee-assign-shift-from"
                      label="Effective From"
                      type="date"
                      value={assignEffectiveFrom}
                      onChange={(event) => setAssignEffectiveFrom(event.target.value)}
                    />
                  </div>
                  <p className="text-xs text-ink-muted">
                    Applies from this date onward and stays in effect until you assign a new one — no need to
                    set it again for every day. A published roster entry for a specific date still overrides it.
                  </p>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="secondary"
                      isLoading={isAssigningShift}
                      disabled={!assignShiftId || !assignEffectiveFrom}
                    >
                      Assign Shift
                    </Button>
                  </div>
                </form>
              )}

              {canReadEmployeeShift && shiftHistory && shiftHistory.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-ink-muted">History</p>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-border">
                    {shiftHistory.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between border-b border-border px-3 py-2 text-xs last:border-b-0"
                      >
                        <span className="text-ink">
                          {assignment.shift?.name ?? 'Shift'} — from {formatDisplayDate(assignment.effectiveFrom)}
                        </span>
                        {canDeleteEmployeeShift && (
                          <button
                            type="button"
                            onClick={() => handleDeleteShiftAssignment(assignment)}
                            aria-label="Delete this shift assignment"
                            className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSaveDetails} className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Edit Details</p>
            {detailsError && <p className="text-sm text-danger">{detailsError}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                id="employee-designation-edit"
                label="Designation"
                value={designationId}
                onChange={(event) => setDesignationId(event.target.value)}
                disabled={!canUpdate}
                placeholder="No designation"
                options={designations.map((d) => ({ value: d.id, label: d.title }))}
              />
              <Select
                id="employee-manager-edit"
                label="Manager"
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                disabled={!canUpdate}
                placeholder="No manager"
                options={employees
                  .filter((e) => e.id !== employee.id)
                  .map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }))}
              />
              <Input
                id="employee-doj-edit"
                label="Date of Joining"
                type="date"
                value={dateOfJoining}
                onChange={(event) => setDateOfJoining(event.target.value)}
                disabled={!canUpdate}
              />
              <Select
                id="employee-type-edit"
                label="Employment Type"
                value={employmentType}
                onChange={(event) =>
                  setEmploymentType(event.target.value as 'full_time' | 'part_time' | 'contract')
                }
                disabled={!canUpdate}
                options={EMPLOYMENT_TYPES}
              />
              <Select
                id="employee-status-edit"
                label="Status"
                value={status}
                onChange={(event) => setStatus(event.target.value as Employee['status'])}
                disabled={!canUpdate}
                options={STATUS_OPTIONS}
              />
              <Select
                id="employee-work-state-edit"
                label="Work State"
                value={workState}
                onChange={(event) => setWorkState(event.target.value)}
                disabled={!canUpdate}
                placeholder="Not set"
                options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
              />
            </div>
            {canUpdate && (
              <div className="flex justify-end">
                <Button type="submit" isLoading={isSavingDetails}>
                  Save Changes
                </Button>
              </div>
            )}
          </form>

          {canTransfer && (
            <form onSubmit={handleTransfer} className="space-y-4 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {usesBrands ? 'Transfer Brand / Department' : 'Transfer Department'}
              </p>
              {transferError && <p className="text-sm text-danger">{transferError}</p>}
              <div className={usesBrands ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : ''}>
                {usesBrands && (
                  <Select
                    id="employee-transfer-brand"
                    label="Brand"
                    value={transferBrandId}
                    onChange={(event) => setTransferBrandId(event.target.value)}
                    options={brands.map((b) => ({ value: b.id, label: b.name }))}
                  />
                )}
                <Select
                  id="employee-transfer-department"
                  label="Department"
                  value={transferDepartmentId}
                  onChange={(event) => setTransferDepartmentId(event.target.value)}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="secondary"
                  isLoading={isTransferring}
                  disabled={
                    (!usesBrands || transferBrandId === (employee.brandId ?? '')) &&
                    transferDepartmentId === employee.departmentId
                  }
                >
                  Transfer
                </Button>
              </div>
            </form>
          )}

          {canInviteEss && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Employee Self-Service Access
              </p>

              {employee.userId && !essActivationToken && !transferActivationToken && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-ink-muted">Logs in with</p>
                      <p className="text-sm font-medium text-ink">
                        {linkedUser === undefined ? 'Loading…' : (linkedUser?.email ?? '—')}
                      </p>
                    </div>
                    {linkedUser && (
                      <Badge tone={linkedUser.isActive ? 'success' : 'danger'}>
                        {linkedUser.isActive ? 'Login Active' : 'Login Inactive'}
                      </Badge>
                    )}
                  </div>

                  {!isTransferFormOpen ? (
                    <Button type="button" variant="secondary" onClick={() => setIsTransferFormOpen(true)}>
                      Transfer to another email
                    </Button>
                  ) : (
                    <form onSubmit={handleTransferLogin} className="space-y-3">
                      <p className="text-sm text-ink-muted">
                        Moving this employee to a new email deactivates the current login and sends a fresh
                        activation link to the new address. Nothing else about this employee changes.
                      </p>
                      {transferLoginError && <p className="text-sm text-danger">{transferLoginError}</p>}
                      <Input
                        id="employee-transfer-login-email"
                        label="New Email"
                        type="email"
                        required
                        value={transferLoginEmail}
                        onChange={(event) => setTransferLoginEmail(event.target.value)}
                        placeholder="new-address@company.com"
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsTransferFormOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" isLoading={isTransferringLogin}>
                          Transfer
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {transferActivationToken && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-muted">
                    This login was transferred to <span className="font-medium">{transferLoginEmail}</span>. An
                    activation invitation was sent.
                  </p>
                  {transferActivationUrl && (
                    <div className="w-full rounded-xl border border-border bg-page p-3 text-left">
                      <p className="mb-1 text-xs font-medium text-ink-muted">
                        Activation link (dev only — no email provider configured yet):
                      </p>
                      <div className="flex items-center gap-2">
                        <a
                          href={transferActivationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block flex-1 break-all text-xs text-primary hover:underline"
                        >
                          {transferActivationUrl}
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyTransferActivationUrl}
                          aria-label="Copy activation link"
                          className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-card hover:text-ink"
                        >
                          {isTransferLinkCopied ? (
                            <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
                          ) : (
                            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!employee.userId && !essActivationToken && (
                <form onSubmit={handleInviteEss} className="space-y-4">
                  <p className="text-sm text-ink-muted">
                    Invite this employee to log in to the ESS portal and manage their own attendance, leave,
                    and profile.
                  </p>
                  {essInviteError && <p className="text-sm text-danger">{essInviteError}</p>}
                  <Input
                    id="employee-ess-email"
                    label="Email"
                    type="email"
                    required
                    value={essEmail}
                    onChange={(event) => setEssEmail(event.target.value)}
                    placeholder="employee@company.com"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary" isLoading={isInvitingEss}>
                      Invite as ESS user
                    </Button>
                  </div>
                </form>
              )}

              {essActivationToken && (
                <div className="space-y-3">
                  <p className="text-sm text-ink-muted">
                    An invitation was created for <span className="font-medium">{essEmail}</span>.
                  </p>
                  {essActivationUrl && (
                    <div className="w-full rounded-xl border border-border bg-page p-3 text-left">
                      <p className="mb-1 text-xs font-medium text-ink-muted">
                        Activation link (dev only — no email provider configured yet):
                      </p>
                      <div className="flex items-center gap-2">
                        <a
                          href={essActivationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block flex-1 break-all text-xs text-primary hover:underline"
                        >
                          {essActivationUrl}
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyEssActivationUrl}
                          aria-label="Copy activation link"
                          className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-card hover:text-ink"
                        >
                          {isEssLinkCopied ? (
                            <Check className="h-3.5 w-3.5 text-success" strokeWidth={1.75} />
                          ) : (
                            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {canDelete && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-danger">Danger Zone</p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">Delete Permanently</p>
                  <p className="text-xs text-ink-muted">
                    Erases this employee and all their records — attendance (including cloud
                    videos), leave/OD/regularization/comp-off, documents, and payroll. Cannot be
                    undone.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  isLoading={isDeleting}
                  onClick={handleDeletePermanently}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  Delete Permanently
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4">
          {!canReadDocs && <p className="text-sm text-ink-muted">You don&apos;t have access to documents.</p>}
          {canReadDocs && (
            <>
              {docsError && <p className="text-sm text-danger">{docsError}</p>}
              {documents === null && <p className="text-sm text-ink-muted">Loading…</p>}
              {documents?.length === 0 && <p className="text-sm text-ink-muted">No documents uploaded yet.</p>}
              {documents && documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const isEditing = editingDocId === doc.id;
                    const canChange = canUploadDocs && doc.status !== 'verified';
                    const decidedLabel =
                      doc.status === 'verified' ? 'Verified' : doc.status === 'rejected' ? 'Rejected' : null;
                    return (
                      <div key={doc.id} className="rounded-xl border border-border px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-1 items-center gap-2.5">
                            <FileText className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    autoFocus
                                    value={editingDocType}
                                    onChange={(event) => setEditingDocType(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') handleSaveDocType(doc);
                                      if (event.key === 'Escape') setEditingDocId(null);
                                    }}
                                    className="w-full rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveDocType(doc)}
                                    disabled={isSavingDocType}
                                    aria-label="Save"
                                    className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-success disabled:opacity-50"
                                  >
                                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingDocId(null)}
                                    aria-label="Cancel"
                                    className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                                  >
                                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                                  </button>
                                </div>
                              ) : (
                                <p className="text-sm font-medium text-ink">{doc.type}</p>
                              )}
                              {doc.fileDownloadUrl ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(doc)}
                                  className="text-xs text-primary hover:underline"
                                >
                                  View file
                                </button>
                              ) : (
                                <span className="text-xs text-ink-muted">File unavailable</span>
                              )}
                              {decidedLabel && (
                                <p className="mt-0.5 text-xs text-ink-muted">
                                  {decidedLabel} by {holidayAuditName(doc.verifier) ?? 'someone no longer in the system'}
                                  {doc.verifiedAt ? ` on ${formatDisplayDateTime(doc.verifiedAt)}` : ''}
                                </p>
                              )}
                              {doc.status === 'rejected' && doc.rejectionReason && (
                                <p className="mt-0.5 text-xs text-danger">Reason: {doc.rejectionReason}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge
                              tone={docStatusTone(doc.status)}
                              title={doc.status === 'rejected' ? doc.rejectionReason ?? undefined : undefined}
                            >
                              {doc.status === 'verified' ? 'Verified' : doc.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </Badge>
                            {canVerifyDocs && doc.status !== 'verified' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleVerify(doc)}
                                  aria-label={`Verify ${doc.type}`}
                                  title="Verify"
                                  className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-success"
                                >
                                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectingDoc(doc)}
                                  aria-label={`Reject ${doc.type}`}
                                  title="Reject"
                                  className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                                >
                                  <X className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                              </>
                            )}
                            {canChange && !isEditing && (
                              <button
                                type="button"
                                onClick={() => handleStartEditDoc(doc)}
                                aria-label={`Edit ${doc.type}`}
                                title="Edit title"
                                className="rounded-md p-1.5 text-ink-muted hover:bg-page hover:text-ink"
                              >
                                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                            )}
                            {canChange && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(doc)}
                                disabled={deletingDocId === doc.id}
                                aria-label={`Delete ${doc.type}`}
                                title="Delete"
                                className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canVerifyDocs && (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Requested Documents
                  </p>
                  {documentRequests && documentRequests.filter((r) => r.status === 'pending').length > 0 && (
                    <div className="space-y-2">
                      {documentRequests
                        .filter((r) => r.status === 'pending')
                        .map((request) => (
                          <div
                            key={request.id}
                            className="flex items-center justify-between rounded-xl border border-border px-4 py-2.5"
                          >
                            <div>
                              <p className="text-sm font-medium text-ink">{request.documentType}</p>
                              {request.note && <p className="text-xs text-ink-muted">{request.note}</p>}
                              <p className="text-xs text-ink-muted">
                                Requested by {holidayAuditName(request.requestedBy) ?? 'someone no longer in the system'}
                                {' · '}
                                {formatDisplayDateTime(request.createdAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge tone="warning">Pending</Badge>
                              <button
                                type="button"
                                onClick={() => handleCancelRequest(request)}
                                disabled={cancellingRequestId === request.id}
                                className="rounded-md p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                                aria-label={`Cancel request for ${request.documentType}`}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  {documentRequests && documentRequests.filter((r) => r.status === 'pending').length === 0 && (
                    <p className="text-sm text-ink-muted">No pending document requests.</p>
                  )}

                  <form onSubmit={handleRequestDocument} className="space-y-4">
                    {requestDocError && <p className="text-sm text-danger">{requestDocError}</p>}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        id="request-doc-type"
                        label="Document to request"
                        required
                        value={requestDocType}
                        onChange={(event) => setRequestDocType(event.target.value)}
                        placeholder="e.g. Aadhaar Card"
                      />
                      <Input
                        id="request-doc-note"
                        label="Note (optional)"
                        value={requestNote}
                        onChange={(event) => setRequestNote(event.target.value)}
                        placeholder="e.g. Please re-upload, previous copy was blurry"
                      />
                    </div>
                    <p className="text-xs text-ink-muted">
                      The employee gets a notification right away asking them to upload this document.
                    </p>
                    <div className="flex justify-end">
                      <Button type="submit" variant="secondary" isLoading={isRequestingDoc} disabled={!requestDocType}>
                        Request Document
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {canUploadDocs && (
                <form onSubmit={handleUpload} className="space-y-4 border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Add Document</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      id="doc-type"
                      label="Type"
                      required
                      value={docType}
                      onChange={(event) => setDocType(event.target.value)}
                      placeholder="e.g. PAN Card"
                    />
                    <FileUploadField file={docFile} onSelect={setDocFile} disabled={isUploading} />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary" isLoading={isUploading} disabled={!docType || !docFile}>
                      Add Document
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'leaveBalance' && (
        <div className="space-y-4">
          {!canReadLeaveBalance && (
            <p className="text-sm text-ink-muted">You don&apos;t have access to leave balances.</p>
          )}
          {canReadLeaveBalance && (
            <>
              <div className="w-32">
                <Select
                  id="leave-balance-year"
                  label="Year"
                  value={String(leaveBalanceYear)}
                  onChange={(event) => setLeaveBalanceYear(Number(event.target.value))}
                  options={[leaveBalanceYear - 1, leaveBalanceYear, leaveBalanceYear + 1].map((y) => ({
                    value: String(y),
                    label: String(y),
                  }))}
                />
              </div>
              {leaveBalanceError && <p className="text-sm text-danger">{leaveBalanceError}</p>}
              {isLoadingLeaveBalances && <p className="text-sm text-ink-muted">Loading…</p>}
              {!isLoadingLeaveBalances && leaveTypes.length === 0 && (
                <p className="text-sm text-ink-muted">No leave types set up for this company yet.</p>
              )}
              {!isLoadingLeaveBalances && leaveTypes.length > 0 && (
                <div className="space-y-2">
                  {leaveTypes.map((type) => {
                    const balance = leaveBalances.find((b) => b.leaveTypeId === type.id);
                    return (
                      <div
                        key={type.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">{type.name}</p>
                          <p className="text-xs text-ink-muted">
                            {balance
                              ? `${balance.allotted} total · ${balance.used} used · ${balance.balance} remaining`
                              : 'Not yet assigned'}
                          </p>
                        </div>
                        {canAdjustLeaveBalance && (
                          <form
                            onSubmit={(event) => handleAdjustLeaveBalance(event, type.id)}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={draftAllotted[type.id] ?? ''}
                              onChange={(event) =>
                                setDraftAllotted((prev) => ({ ...prev, [type.id]: event.target.value }))
                              }
                              placeholder="Total"
                              className="w-20 rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <Button type="submit" variant="secondary" isLoading={savingLeaveTypeId === type.id}>
                              Save
                            </Button>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'powers' && (
        <div className="space-y-4">
          {!canUpdate && <p className="text-sm text-ink-muted">You don&apos;t have access to manage powers.</p>}
          {canUpdate && (
            <>
              <p className="text-sm text-ink-muted">
                Hand-pick extra capabilities for this employee, independent of their role.
              </p>
              {powersError && <p className="text-sm text-danger">{powersError}</p>}
              {powersSuccess && <p className="text-sm text-success">Powers updated.</p>}
              <PowerAssignment selectedKeys={powerKeys} onChange={setPowerKeys} />
              <div className="flex justify-end">
                <Button onClick={handleSavePowers} isLoading={isSavingPowers}>
                  Save Powers
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      </Modal>
      {previewDoc && (
        <FilePreviewModal
          title={previewDoc.type}
          fileUrl={previewDoc.fileUrl}
          previewUrl={previewDoc.fileDownloadUrl}
          downloadUrl={previewDoc.fileAttachmentUrl}
          onClose={() => setPreviewDoc(null)}
        />
      )}
      {rejectingDoc && (
        <RejectReasonModal
          title={`Reject ${rejectingDoc.type}`}
          onClose={() => setRejectingDoc(null)}
          onConfirm={handleRejectConfirm}
        />
      )}
    </>
  );
}
