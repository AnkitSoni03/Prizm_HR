'use strict';

// Backs the new per-employee "powers" feature: an optional, admin-assigned
// dedicated Role (companies-scoped, is_system=false — an already-existing
// but previously unused extension point on the roles table) holding
// whichever extra permission bundles ("powers") an admin hand-picks for this
// one employee, independent of their base Employee role.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'custom_role_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'roles', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'custom_role_id');
  },
};
