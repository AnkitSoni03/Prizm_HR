'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_runs', {
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
      period_month: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      period_year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      pay_period_start: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      pay_period_end: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('draft', 'processed', 'paid', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
      },
      total_gross: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      total_deductions: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      total_net: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      processed_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      paid_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      paid_by_user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex('payroll_runs', ['company_id', 'period_year', 'period_month'], {
      unique: true,
      name: 'payroll_runs_company_period_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_runs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payroll_runs_status";');
  },
};
