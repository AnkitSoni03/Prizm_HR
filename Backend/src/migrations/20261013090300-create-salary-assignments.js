'use strict';

// One employee's salary: template + CTC (entered monthly or yearly) + which
// deductions apply to them. Versioned — a revision supersedes the active row
// (effective_to = day before the new one) instead of editing it, so earlier
// months keep the salary they were paid on. An in-place edit is only for
// correcting a mistake, and recalculates every already-generated month it
// covers.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('salary_assignments', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      template_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'payroll_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      ctc_period: { type: Sequelize.ENUM('monthly', 'yearly'), allowNull: false },
      ctc_amount: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      monthly_ctc: { type: Sequelize.DECIMAL(14, 2), allowNull: false },
      effective_from: { type: Sequelize.DATEONLY, allowNull: false },
      effective_to: { type: Sequelize.DATEONLY, allowNull: true },
      // Master switch: false = no deductions and no employer contributions at
      // all, in-hand = CTC.
      deductions_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      // Item keys switched off for this employee only (e.g. ["esi","pt"]).
      disabled_items: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      status: { type: Sequelize.ENUM('active', 'superseded', 'ended'), allowNull: false, defaultValue: 'active' },
      note: { type: Sequelize.TEXT, allowNull: true },
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
    await queryInterface.addIndex('salary_assignments', ['group_id']);
    await queryInterface.addIndex('salary_assignments', ['company_id']);
    await queryInterface.addIndex('salary_assignments', ['employee_id', 'effective_from']);
    await queryInterface.addIndex('salary_assignments', ['template_id']);
    await queryInterface.sequelize.query(
      "CREATE UNIQUE INDEX salary_assignments_one_active ON salary_assignments (employee_id) WHERE status = 'active' AND deleted_at IS NULL;"
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('salary_assignments');
  },
};
