'use strict';

// One row per company, lazy-created (same convention as leave_balances'
// getOrCreateBalance) the first time payroll settings are read/updated —
// no seeder backfills this for existing companies.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_settings', {
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
      pay_cycle_start_day: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      // Master toggle only — v1 has no statutory calculation logic behind
      // it. Exists now so a company can be flagged for it later without a
      // schema change.
      enable_statutory_deductions: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Reserved for future PF/ESI/PT/TDS rate configuration — unused in v1.
      statutory_config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      currency: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'INR',
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

    await queryInterface.addIndex('payroll_settings', ['company_id'], {
      unique: true,
      name: 'payroll_settings_company_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_settings');
  },
};
