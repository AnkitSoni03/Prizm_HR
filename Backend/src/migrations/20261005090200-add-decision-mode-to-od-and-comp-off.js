'use strict';

// Same meaning as leave_requests.decision_mode: 'manager_consensus' — every
// snapshotted manager approved (or one rejected); 'admin_override' — a
// company/brand-wide admin decided directly. Null while pending, for a
// cancelled/expired/manually-granted item, or one that predates this.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('od_requests', 'decision_mode', {
      type: Sequelize.ENUM('manager_consensus', 'admin_override'),
      allowNull: true,
    });
    await queryInterface.addColumn('comp_off_credits', 'decision_mode', {
      type: Sequelize.ENUM('manager_consensus', 'admin_override'),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('od_requests', 'decision_mode');
    await queryInterface.removeColumn('comp_off_credits', 'decision_mode');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_od_requests_decision_mode";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_comp_off_credits_decision_mode";');
  },
};
