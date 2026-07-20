'use strict';

// Neither `employees` nor `users` has ever had a name column — not in this
// implementation, and not in the original PHASE1_MODELS.md design (both are
// pure identity/org-structure records: employees by employee_code, users by
// email). Nullable rather than required: existing rows (if any) have no
// value to backfill from, and nothing elsewhere in the schema can supply one.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'name', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'name');
  },
};
