'use strict';

// Shift names must be unique per company (case-insensitively) — timing
// (start_time/end_time) is explicitly allowed to repeat across shifts, only
// the name is the uniqueness key. Same "active-row partial unique index"
// pattern as leave_types_company_id_code_unique: scoped to
// WHERE deleted_at IS NULL so a soft-deleted shift's old name doesn't
// permanently block reuse.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX shifts_company_id_lower_name_unique
      ON shifts (company_id, lower(name))
      WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS shifts_company_id_lower_name_unique;');
  },
};
