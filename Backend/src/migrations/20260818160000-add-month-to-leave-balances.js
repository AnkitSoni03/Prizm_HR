'use strict';

// Fixes a real bug: leave_balances had exactly one row per (employee,
// leaveType, year) — for a 'monthly_reset' policy ("2 Short Leave/month,
// use-it-or-lose-it"), the monthly cron reset THAT SAME row's allotted/used
// in place every month rather than creating a new one. If a leave applied
// for on, say, Aug 30 wasn't approved until Sep 2–3, the Sep 1 cron run had
// already reset the shared row back to September's fresh quota by the time
// approval posted its deduction — so the deduction silently landed on
// September's balance instead of August's, and August's actual usage was
// overwritten by the reset before it was ever recorded.
//
// Fix: 'monthly_reset' leave types now get one balance row PER MONTH
// (month 1–12) instead of sharing the year's single row — every other
// accrual type ('yearly', 'monthly') keeps exactly the year-grain behavior
// it already had (month stays NULL for those, unique index unchanged in
// effect). Two partial unique indexes replace the old single one: a
// month-less row still only exists once per (employee, leaveType, year); a
// month-bearing row only exists once per (employee, leaveType, year, month).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_balances', 'month', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.removeIndex('leave_balances', 'leave_balances_employee_id_leave_type_id_year_unique');
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX leave_balances_employee_id_leave_type_id_year_unique
      ON leave_balances (employee_id, leave_type_id, year)
      WHERE month IS NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX leave_balances_employee_id_leave_type_id_year_month_unique
      ON leave_balances (employee_id, leave_type_id, year, month)
      WHERE month IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS leave_balances_employee_id_leave_type_id_year_month_unique;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS leave_balances_employee_id_leave_type_id_year_unique;');
    await queryInterface.removeColumn('leave_balances', 'month');
    await queryInterface.addIndex('leave_balances', ['employee_id', 'leave_type_id', 'year'], {
      unique: true,
      name: 'leave_balances_employee_id_leave_type_id_year_unique',
    });
  },
};
