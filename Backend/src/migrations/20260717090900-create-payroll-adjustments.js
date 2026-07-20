'use strict';

// Ad-hoc bonus/deduction, created any time before the target period's run
// processes it. This is the extensibility seam for future loans/advances/
// arrears — those become new component_definition_id categorizations of the
// same generic bonus/deduction shape, not new tables.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_adjustments', {
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
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // Filled in once a run consumes it; null until then.
      payroll_run_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'payroll_runs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      period_month: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      period_year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      // Optional categorization against the catalog (e.g. a future "Loan EMI
      // Deduction" component) — null means a plain one-off with just a
      // free-text description.
      component_definition_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'salary_component_definitions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      type: {
        type: Sequelize.ENUM('bonus', 'deduction'),
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'applied', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      created_by_user_id: {
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

    await queryInterface.addIndex('payroll_adjustments', ['employee_id', 'period_year', 'period_month', 'status'], {
      name: 'payroll_adjustments_employee_period_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_adjustments');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_adjustments_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_adjustments_status";');
  },
};
