'use strict';

// Closes the gap where `leave_types.carry_forward` was a schema-only flag
// with zero actual effect (confirmed by grep before this migration — nothing
// in leaveBalance.service.js/leaveAccrual.job.js ever read it). These three
// columns make it real:
//   - `cycle_type`: whether this leave type's yearly balance resets on the
//     calendar year (Jan 1 – Dec 31, the only behavior that existed before
//     this migration) or on the employee's own joining-date anniversary.
//   - `max_carry_forward_days`: caps how much of an unused balance rolls
//     into the next cycle when `carry_forward` is true. NULL means
//     unlimited carry-forward (not zero — `carry_forward: false` is what
//     means zero).
//   - `default_accrual`: a pure UX default that pre-fills the Accrual field
//     on the Add Leave Policy form when this type is selected — never
//     enforced, a Roster-specific policy can still pick a different accrual
//     for the same leave type (see leavePolicy.service.js's existing
//     per-Roster override design).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_types', 'cycle_type', {
      type: Sequelize.ENUM('calendar', 'anniversary'),
      allowNull: false,
      defaultValue: 'calendar',
    });
    await queryInterface.addColumn('leave_types', 'max_carry_forward_days', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('leave_types', 'default_accrual', {
      type: Sequelize.ENUM('yearly', 'monthly', 'monthly_reset'),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_types', 'default_accrual');
    await queryInterface.removeColumn('leave_types', 'max_carry_forward_days');
    await queryInterface.removeColumn('leave_types', 'cycle_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_leave_types_cycle_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_leave_types_default_accrual";');
  },
};
