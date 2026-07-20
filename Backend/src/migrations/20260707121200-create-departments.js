'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('departments', {
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
      code: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // FK -> employees.id added later in 20260707121600-add-deferred-foreign-keys.js:
      // employees doesn't exist yet (employees.department_id -> departments).
      head_employee_id: {
        type: Sequelize.BIGINT,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('departments');
  },
};
