'use strict';

// Groups need their own first-admin invite flow (parity with Companies via
// POST /auth/signup-invite), but users/invitations were only ever scoped by
// company_id. This adds a parallel group_id scope: a platform-level user
// (company_id NULL) is now either a Super Admin (group_id also NULL) or a
// Group Admin (group_id set) — see requireSuperAdmin in auth.middleware.js,
// which was updated alongside this migration to check both columns.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.changeColumn('invitations', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn('invitations', 'group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.addColumn('user_roles', 'group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'groups', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('user_roles', 'group_id');
    await queryInterface.removeColumn('invitations', 'group_id');
    await queryInterface.changeColumn('invitations', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
    });
    await queryInterface.removeColumn('users', 'group_id');
  },
};
