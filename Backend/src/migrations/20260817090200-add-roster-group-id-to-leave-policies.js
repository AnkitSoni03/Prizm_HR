'use strict';

// Lets a Roster Group override the company-wide default leave policy for one
// specific leave type (e.g. a higher quota for a region). The unique index
// this column needs is handled separately in the next migration, since it
// replaces (rather than extends) the existing company_id+leave_type_id
// unique index.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_policies', 'roster_group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'roster_groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_policies', 'roster_group_id');
  },
};
