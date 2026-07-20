'use strict';

// Company's catalog of payable/deductible components (mirrors leave_types'
// shape: a per-company code+name catalog). percentage_of_component_id is
// added in a separate deferred-FK migration since it's a self-reference and
// the table must exist first.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('salary_component_definitions', {
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
      code: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      // 'reimbursement' unused in v1, reserved.
      component_category: {
        type: Sequelize.ENUM('earning', 'deduction', 'reimbursement'),
        allowNull: false,
      },
      // 'formula' unused in v1, reserved for a future expression engine.
      calculation_type: {
        type: Sequelize.ENUM('fixed_amount', 'percentage_of_component', 'formula'),
        allowNull: false,
      },
      default_value: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      percentage_of_component_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      // Flags a future PF/ESI/PT/TDS-style built-in component, distinct from
      // a company's own custom components — unused in v1 (nothing seeds
      // is_statutory=true today).
      is_statutory: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // Reserved for future TDS calculation — unused in v1.
      taxable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    // code (BASIC/HRA/...) must be unique per tenant, not globally — same
    // shape as leave_types.company_id+code.
    await queryInterface.addIndex('salary_component_definitions', ['company_id', 'code'], {
      unique: true,
      name: 'salary_component_definitions_company_id_code_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('salary_component_definitions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_salary_component_definitions_component_category";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_salary_component_definitions_calculation_type";');
  },
};
