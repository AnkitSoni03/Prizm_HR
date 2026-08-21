'use strict';

// Optional, admin-assigned enrollment: an employee with comp_off_policy_id
// left null earns NO comp-off credits at all — checkAndCreateCompOffCredit
// (compOff.service.js) returns immediately when this is null, regardless of
// working a holiday/week-off. Deliberately not backfilled/defaulted for any
// existing employee (explicit product decision: comp-off is opt-in, nobody
// is auto-enrolled) — an admin assigns it via the new Comp Off Setting page.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'comp_off_policy_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'comp_off_policies', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('employees', ['comp_off_policy_id'], {
      name: 'employees_comp_off_policy_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('employees', 'employees_comp_off_policy_id_idx');
    await queryInterface.removeColumn('employees', 'comp_off_policy_id');
  },
};
