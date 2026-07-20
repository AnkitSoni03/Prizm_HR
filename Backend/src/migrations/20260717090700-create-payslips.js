'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payslips', {
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
      payroll_run_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'payroll_runs', key: 'id' },
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
      // Traceability: whichever structure was status='active' as of period
      // end. When a mid-period structure change occurred, this points at
      // the "current" one even though an earlier segment used a different,
      // now-superseded structure — see payrollRun.service.js's segment-based
      // proration.
      salary_structure_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employee_salary_structures', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      working_days: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      lop_days: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      payable_days: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      gross_earnings: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      total_deductions: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      net_pay: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
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

    await queryInterface.addIndex('payslips', ['payroll_run_id', 'employee_id'], {
      unique: true,
      name: 'payslips_run_employee_unique',
    });
    await queryInterface.addIndex('payslips', ['employee_id'], {
      name: 'payslips_employee_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payslips');
  },
};
