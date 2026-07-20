'use strict';

// payslip_components.category gains 'employer_contribution' — for
// system-computed, informational-only rows (employer PF/ESI shares) that
// must never be summed into grossEarnings or totalDeductions. The existing
// category filters in payrollRun.service.js already only match
// 'earning'/'reimbursement' (gross) and 'deduction' (deductions), so this
// new value rides the existing PayslipComponent plumbing for free without
// touching net pay math. Same standalone ALTER TYPE pattern already used by
// 20260717091100-add-processed-paid-to-approval-histories-action.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_payslip_components_category" ADD VALUE IF NOT EXISTS 'employer_contribution';`
    );
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE. No-op.
  },
};
