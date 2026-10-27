'use strict';

// Approving a half-day leave used to leave an already-punched day as
// 'present', so the Attendance Board / Records never showed "Half Day".
// Approval now flips it to 'half_day' (leaveRequest.service.js); this fixes
// the days approved before that. Payroll is unaffected — it treats
// present/half_day the same and pays the leave half from the request.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE attendance a
         SET status = 'half_day', updated_at = NOW()
        FROM leave_requests lr
       WHERE lr.employee_id = a.employee_id
         AND lr.from_date = a.date
         AND lr.status = 'approved'
         AND lr.half_day_session IS NOT NULL
         AND lr.deleted_at IS NULL
         AND a.status = 'present'
         AND a.deleted_at IS NULL
    `);
  },

  // Not reversible: 'half_day' rows set by hand can't be told apart.
  async down() {},
};
