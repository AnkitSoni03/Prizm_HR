'use strict';

module.exports = {
  // employee_shifts previously had only a plain lookup index on
  // (employee_id, effective_from) — unlike shift_rosters, which enforces one
  // row per (employee_id, roster_date) with a real unique constraint. Two
  // default-shift assignments could silently exist for the same employee
  // starting on the same date, and getActiveEmployeeShift's
  // `ORDER BY effective_from DESC` + findOne had no defined tiebreaker for
  // which one is "active". This replaces the plain index with a unique one
  // covering the same columns, so the same lookup pattern is still served
  // and the duplicate case is now rejected outright.
  async up(queryInterface) {
    await queryInterface.removeIndex('employee_shifts', 'employee_shifts_employee_id_effective_from_idx');
    await queryInterface.addIndex('employee_shifts', ['employee_id', 'effective_from'], {
      unique: true,
      name: 'employee_shifts_employee_id_effective_from_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('employee_shifts', 'employee_shifts_employee_id_effective_from_unique');
    await queryInterface.addIndex('employee_shifts', ['employee_id', 'effective_from'], {
      name: 'employee_shifts_employee_id_effective_from_idx',
    });
  },
};
