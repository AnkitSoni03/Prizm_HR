'use strict';

// Group-level salary templates (modules/payroll/payrollTemplate.service.js).
// Created/edited only by a Group Admin or a group-level "Manage Payroll"
// power holder; Company/Brand Admins only view them. Every %/cap/amount and
// every on/off toggle lives in `rules` (JSONB, shape documented in
// modules/payroll/payrollRules.js) so each company can follow its own policy
// without schema changes. No company_id — a template spans the whole Group.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_templates', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      name: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      rules: { type: Sequelize.JSONB, allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      updated_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('payroll_templates', ['group_id']);
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX payroll_templates_group_name_unique ON payroll_templates (group_id, lower(name)) WHERE deleted_at IS NULL;'
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_templates');
  },
};
