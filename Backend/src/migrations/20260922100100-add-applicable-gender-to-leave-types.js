'use strict';

const { DataTypes } = require('sequelize');

// Admin-set, per-leave-type gender restriction — 'all' (default, every
// existing leave type keeps working exactly as before) or one of
// male/female/other. Enforced in leaveRequest.service.js::createLeaveRequest
// (real backstop) and filters the leave type out of an employee's own
// applicable-types list (leaveType.service.js::listLeaveTypes) when it
// doesn't match their employees.gender — see that migration. Lets an admin
// set up e.g. "Maternity Leave" (female) / "Paternity Leave" (male) so they
// only ever show up for and can be applied by the right employees.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('leave_types', 'applicable_gender', {
      type: DataTypes.ENUM('all', 'male', 'female', 'other'),
      allowNull: false,
      defaultValue: 'all',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_types', 'applicable_gender');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_leave_types_applicable_gender";');
  },
};
