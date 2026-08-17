'use strict';

// Optional add-on: an employee with roster_group_id left null keeps working
// exactly as before this column existed (company/brand-wide holidays,
// company-wide leave policy, employee_shifts default). Assigning one is what
// pulls in that Roster Group's shift/holidays/leave-policy bundle — see
// resolveShiftForDate (attendance.service.js), isHoliday/isWorkingDay
// (utils/workingDays.js), and getOrCreateBalance (leaveBalance.service.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'roster_group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'roster_groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('employees', ['roster_group_id'], {
      name: 'employees_roster_group_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('employees', 'employees_roster_group_id_idx');
    await queryInterface.removeColumn('employees', 'roster_group_id');
  },
};
