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
// every base role (see the permission seeders), so those two bundles only
// need to add the *write* codes.
const POWER_CATALOG = [
  {
    key: 'holidays',
    label: 'Add / Edit / Delete Yearly Holidays',
    description: 'Create, update, and delete the company’s yearly holiday list.',
    permissionCodes: ['holiday:create', 'holiday:update', 'holiday:delete'],
  },
  {
    key: 'assign_leaves',
    label: 'Assign Leaves',
    description: "View and adjust any employee's leave balances.",
    // The "Provide Leaves" page has to browse/filter the employee directory
    // to pick who to assign a balance to — employee:read/department:read/
    // brand:read are needed for that (Company Admin/HR Manager already hold
    // these broadly as part of their role, which is why this gap didn't
    // surface until an Employee was granted just this one power).
    permissionCodes: [
      'leave_balance:read', 'leave_balance:adjust',
      'employee:read', 'department:read', 'brand:read',
    ],
  },
  {
    key: 'company_policy',
    label: 'Add / Edit / Delete Company Policy',
    description: 'Create, update, and delete company policy documents.',
    permissionCodes: ['company_policy:create', 'company_policy:update', 'company_policy:delete'],
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
    // Same rationale as assign_leaves: the "Document Verification" page has
    // to browse/filter the employee directory to pick whose documents to
    // review — employee:read/department:read/brand:read are needed for
    // that (Company Admin/HR Manager already hold these broadly as part of
    // their role, which is why this gap pattern keeps recurring for
    // narrowly-scoped Employee powers).
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
    // salary structure, same rationale as the assign_leaves bundle above.
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
