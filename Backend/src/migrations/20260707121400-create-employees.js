'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('employees', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      employee_code: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      company_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      brand_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'brands', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      department_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      designation_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'designations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // Self-referential; safe to declare inline since Postgres resolves
      // the FK against the table being created within the same statement.
      manager_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      date_of_joining: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      employment_type: {
        type: Sequelize.ENUM('full_time', 'part_time', 'contract'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('onboarding', 'active', 'on_notice', 'exited', 'archived'),
        allowNull: false,
        defaultValue: 'onboarding',
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

    // employee_code must be unique per tenant, not globally.
    await queryInterface.addIndex('employees', ['company_id', 'employee_code'], {
      unique: true,
      name: 'employees_company_id_employee_code_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('employees');
  },
};
