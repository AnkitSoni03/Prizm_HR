'use strict';

// A Roster Group is a reusable, company-level bundle (Shift + region-specific
// Holidays + Leave Policy overrides) an employee is assigned to once instead
// of an admin configuring all three separately. Company-level, not brand-
// scoped — a Brand can span multiple cities. Optional add-on: an employee
// with no roster_group_id keeps working exactly as before this table existed
// (see employees.roster_group_id, added in a later migration).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('roster_groups', {
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
      description: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // Nullable — a Roster Group can exist purely for its holidays/leave
      // policy without also overriding shift timing (resolveShiftForDate
      // simply skips this tier when null, see attendance.service.js).
      shift_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      updated_by: {
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

    await queryInterface.addIndex('roster_groups', ['company_id', 'name'], {
      name: 'roster_groups_company_id_name_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('roster_groups');
  },
};
