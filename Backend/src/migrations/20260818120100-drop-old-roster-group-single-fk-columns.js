'use strict';

// Replaced by the many-to-many join tables from the previous migration.
// Confirmed no real (non-test) data existed on any of these columns before
// dropping — this is a clean cutover, not a backfill.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn('roster_groups', 'shift_id');

    await queryInterface.removeIndex('holidays', 'holidays_company_id_roster_group_id_date_idx');
    await queryInterface.removeColumn('holidays', 'roster_group_id');

    // Revert leave_policies back to the original single unique index —
    // roster-scoping now lives entirely in roster_group_leave_policies, so
    // every LeavePolicy row is once again just "the company-wide rule for
    // this leave type", full stop.
    await queryInterface.removeIndex('leave_policies', 'leave_policies_roster_group_unique');
    await queryInterface.removeIndex('leave_policies', 'leave_policies_company_wide_unique');
    await queryInterface.removeColumn('leave_policies', 'roster_group_id');
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id'], {
      unique: true,
      name: 'leave_policies_company_id_leave_type_id_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('leave_policies', 'leave_policies_company_id_leave_type_id_unique');
    await queryInterface.addColumn('leave_policies', 'roster_group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'roster_groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id'], {
      unique: true,
      name: 'leave_policies_company_wide_unique',
      where: { roster_group_id: null },
    });
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id', 'roster_group_id'], {
      unique: true,
      name: 'leave_policies_roster_group_unique',
      where: { roster_group_id: { [Sequelize.Op.ne]: null } },
    });

    await queryInterface.addColumn('holidays', 'roster_group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'roster_groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('holidays', ['company_id', 'roster_group_id', 'date'], {
      name: 'holidays_company_id_roster_group_id_date_idx',
    });

    await queryInterface.addColumn('roster_groups', 'shift_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'shifts', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },
};
