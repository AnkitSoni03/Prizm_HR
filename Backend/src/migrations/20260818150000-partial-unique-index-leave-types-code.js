'use strict';

// leave_types.code was uniquely indexed as (company_id, code) with no
// WHERE clause — so a soft-deleted row (deleted_at set, per this project's
// "soft deletes only, never hard-delete" rule) still occupied the slot,
// permanently blocking recreation of a leave type with the same code even
// though it no longer showed up anywhere in the UI. Same "active-row
// partial unique index" fix already established for
// employee_salary_structures/employee_face_profiles: scope the constraint
// to WHERE deleted_at IS NULL, so only *currently visible* rows compete for
// a code — a deleted row simply stops counting.
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeIndex('leave_types', 'leave_types_company_id_code_unique');
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX leave_types_company_id_code_unique
      ON leave_types (company_id, code)
      WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS leave_types_company_id_code_unique;');
    await queryInterface.addIndex('leave_types', ['company_id', 'code'], {
      unique: true,
      name: 'leave_types_company_id_code_unique',
    });
  },
};
