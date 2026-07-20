'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shift_rosters', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      // Nullable: CLAUDE.md requires a Brand to have >=1 roster before it
      // can receive its first employee, which is only satisfiable if a
      // roster row can exist with no employee yet (an "unassigned slot"
      // later filled in) — same circular-FK shape as the deferred-FK
      // columns from the Phase-1 build order, resolved the same way.
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      shift_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      brand_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'brands', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      roster_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('draft', 'published'),
        allowNull: false,
        defaultValue: 'draft',
      },
      published_by: {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
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

    // One roster entry per employee per day — a published/draft roster
    // overrides employee_shifts for that specific date (CLAUDE.md rule 7).
    // Postgres treats NULLs as distinct for uniqueness, so this doesn't
    // block multiple unassigned (employee_id NULL) slots on the same date.
    await queryInterface.addIndex('shift_rosters', ['employee_id', 'roster_date'], {
      unique: true,
      name: 'shift_rosters_employee_id_roster_date_unique',
    });
    // Supports "does this Brand have >=1 roster yet" (tenancy rule: a Brand
    // needs a Roster before its first employee) without a full table scan.
    await queryInterface.addIndex('shift_rosters', ['brand_id'], {
      name: 'shift_rosters_brand_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shift_rosters');
  },
};
