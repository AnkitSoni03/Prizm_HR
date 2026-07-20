'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // A Super Admin sits above the Group/Company hierarchy, so their users/
    // user_roles rows have no company_id — mirrors the existing
    // roles.company_id NULL = system role convention.
    await queryInterface.changeColumn('users', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.changeColumn('user_roles', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });

    // The existing (company_id, email) unique index treats NULLs as distinct,
    // so it wouldn't stop two platform-level users from sharing an email.
    // This partial index closes that gap.
    await queryInterface.addIndex('users', ['email'], {
      unique: true,
      where: { company_id: null },
      name: 'users_platform_email_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('users', 'users_platform_email_unique');
    await queryInterface.changeColumn('user_roles', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
    });
    await queryInterface.changeColumn('users', 'company_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
    });
  },
};
