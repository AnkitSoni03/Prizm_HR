'use strict';

// A Comp-Off Policy is a company-level, admin-defined bundle (expiry window +
// carry-forward behavior) an employee is explicitly assigned to before the
// comp-off feature does anything for them — see employees.comp_off_policy_id
// (next migration). No brand_id column: company-wide entity, same tier as
// Department/Designation/Shift/RosterGroup.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('comp_off_policies', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      // How many days after the earned date a credit under this policy is
      // valid — mirrors the previously-hardcoded DEFAULT_EXPIRY_DAYS (90) in
      // compOff.service.js, now admin-configurable per policy.
      expiry_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 90,
      },
      // If true, credits earned under this policy never expire (compOff.
      // service.js stores expiry_date: NULL for them, and
      // compOffExpiry.job.js's sweep — which only ever matches
      // expiry_date < today — naturally never touches a NULL row, no extra
      // branching needed there).
      carry_forward: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      updated_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('comp_off_policies', ['company_id', 'name'], {
      name: 'comp_off_policies_company_id_name_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('comp_off_policies');
  },
};
