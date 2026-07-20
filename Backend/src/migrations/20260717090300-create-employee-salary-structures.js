'use strict';

// Versioned per employee — a new row supersedes the old one (status flips to
// 'superseded', effective_to set), never mutated in place. This is what
// guarantees a payslip generated against an old structure never silently
// changes if the employee's pay is later revised.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employee_salary_structures', {
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
      effective_from: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      effective_to: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      annual_ctc: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('active', 'superseded'),
        allowNull: false,
        defaultValue: 'active',
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

    await queryInterface.addIndex('employee_salary_structures', ['employee_id'], {
      name: 'employee_salary_structures_employee_id_idx',
    });
    await queryInterface.addIndex('employee_salary_structures', ['company_id'], {
      name: 'employee_salary_structures_company_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employee_salary_structures');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_employee_salary_structures_status";');
  },
};
