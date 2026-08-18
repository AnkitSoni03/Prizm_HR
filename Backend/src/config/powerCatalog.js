'use strict';

// The curated list of hand-pickable "powers" an admin (Company Admin/HR
// Manager/Brand Admin, anyone holding employee:update) can optionally grant
// to a specific Employee, independent of their base role. Each bundle's
// `permissionCodes` are unioned into that employee's dedicated custom Role
// (see employee.service.js::assignEmployeePowers) — this file is the single
// source of truth, consumed both by the assignment endpoint (validation)
// and by GET /powers (so the frontend never hardcodes a copy that could
// drift).
//
// `holiday:read` and `company_policy:read` are already broadly granted to
// every base role (see the permission seeders).
const POWER_CATALOG = [
  {
    key: 'roster',
    label: 'Create & Assign Roster',
    description:
      'Create Rosters, and create/edit/assign the Shift, Holidays, Company Policies, and Leave Policy that go with them.',
    // Roster is the container everything an employee's day-to-day setup now
    // depends on (see leaveBalance.service.js::resolveLeavePolicy /
    // workingDays.js::isHoliday — both roster-exclusive, no company-wide
    // fallback). Holding this power means full read/write across the whole
    // bundle: the Roster itself, plus every entity a Roster can have linked
    // to it. shift:read/roster_group:read/leave_policy:read aren't broadly
    // granted to Employee already (unlike holiday:read/company_policy:read),
    // so they're listed explicitly here. employee:read is needed to browse
    // the employee directory when bulk-assigning a Roster to people, same
    // rationale as the document_verification bundle below. leave_type:create
    // covers the "+ Add Leave Type" shortcut on the Add Leave Policy form
    // (LeavePolicyFormModal.tsx) — creating the leave policies a Roster
    // needs shouldn't be blocked on a leave type that doesn't exist yet.
    permissionCodes: [
      'roster_group:create', 'roster_group:read', 'roster_group:update', 'roster_group:delete',
      'shift:read', 'shift:create', 'shift:update', 'shift:delete',
      'holiday:create', 'holiday:update', 'holiday:delete',
      'company_policy:create', 'company_policy:update', 'company_policy:delete',
      'leave_policy:read', 'leave_policy:create', 'leave_policy:update',
      'leave_type:create', 'leave_type:update', 'leave_type:delete',
      'employee:read',
    ],
  },
  {
    key: 'approve_requests',
    label: 'Approve Leave / OD Requests',
    description: "Approve or reject any employee's leave and on-duty requests, company-wide.",
    permissionCodes: [
      'leave_request:read', 'leave_request:approve', 'leave_request:reject',
      'od_request:read', 'od_request:approve', 'od_request:reject',
    ],
  },
  {
    key: 'document_verification',
    label: 'Document Verification',
    description: "View any employee's documents and mark them verified.",
    // The "Document Verification" page has to browse/filter the employee
    // directory to pick whose documents to review — employee:read/
    // department:read/brand:read are needed for that (Company Admin/HR
    // Manager already hold these broadly as part of their role, which is
    // why this gap pattern keeps recurring for narrowly-scoped Employee
    // powers — see the run_payroll bundle below for the same shape).
    permissionCodes: [
      'employee_document:read', 'employee_document:verify',
      'employee:read', 'department:read', 'brand:read',
    ],
  },
  {
    key: 'run_payroll',
    label: 'Manage & Run Payroll',
    description: 'Configure salary structures, add adjustments, and process/pay monthly payroll runs.',
    // employee:read is needed to browse/pick employees when assigning a
    // salary structure, same rationale as the document_verification bundle
    // above.
    permissionCodes: [
      'payroll_settings:read', 'payroll_settings:update',
      'salary_component:create', 'salary_component:read', 'salary_component:update', 'salary_component:delete',
      'salary_structure:create', 'salary_structure:read', 'salary_structure:update',
      'payroll_adjustment:create', 'payroll_adjustment:read', 'payroll_adjustment:update', 'payroll_adjustment:delete',
      'payroll_run:create', 'payroll_run:read', 'payroll_run:process', 'payroll_run:pay', 'payroll_run:cancel',
      'payslip:read', 'employee:read',
    ],
  },
];

const POWER_KEYS = new Set(POWER_CATALOG.map((power) => power.key));

function permissionCodesForKeys(powerKeys) {
  const codes = new Set();
  for (const key of powerKeys) {
    const power = POWER_CATALOG.find((p) => p.key === key);
    if (power) power.permissionCodes.forEach((code) => codes.add(code));
  }
  return [...codes];
}

module.exports = { POWER_CATALOG, POWER_KEYS, permissionCodesForKeys };
