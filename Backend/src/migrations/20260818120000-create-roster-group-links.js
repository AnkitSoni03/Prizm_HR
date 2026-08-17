'use strict';

// Redesign: instead of Holiday/LeavePolicy each carrying a single optional
// roster_group_id column (many-to-one), Shift/Holiday/CompanyPolicy/
// LeavePolicy can each now be assigned to one or more Roster Groups —
// assignment happens from the entity's OWN create/edit form ("Assign to
// Roster(s)"), not from the Roster Group's page. Four join tables, one per
// entity type — kept separate (rather than one polymorphic table) to match
// this codebase's existing convention of a plain FK-pair join table per
// relationship (see e.g. role_permissions).
module.exports = {
  async up(queryInterface, Sequelize) {
    // roster_group_shifts: a Roster Group has AT MOST ONE Shift (explicit
    // product decision — an employee can only work one shift at a time, so
    // conflicting assignments are rejected at the application layer rather
    // than silently picking a winner). The unique index is on roster_group_id
    // ALONE (not the pair) to enforce that. The same Shift can still be
    // linked to multiple different Roster Groups.
    await queryInterface.createTable('roster_group_shifts', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      roster_group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'roster_groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      shift_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('roster_group_shifts', ['roster_group_id'], {
      unique: true,
      name: 'roster_group_shifts_one_per_roster_group',
    });
    await queryInterface.addIndex('roster_group_shifts', ['shift_id'], { name: 'roster_group_shifts_shift_id_idx' });

    // roster_group_holidays: genuinely many-to-many — the same holiday event
    // can apply to several Roster Groups, and a Roster Group can have many
    // extra holidays.
    await queryInterface.createTable('roster_group_holidays', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      roster_group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'roster_groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      holiday_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'holidays', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('roster_group_holidays', ['roster_group_id', 'holiday_id'], {
      unique: true,
      name: 'roster_group_holidays_unique_pair',
    });
    await queryInterface.addIndex('roster_group_holidays', ['holiday_id'], { name: 'roster_group_holidays_holiday_id_idx' });

    // roster_group_company_policies: many-to-many, informational + gates
    // ESS visibility (a policy linked to specific Roster Group(s) is only
    // shown to that Group's employees, on top of company-wide-always-visible
    // ones — see companyPolicy.service.js::listCompanyPolicies).
    await queryInterface.createTable('roster_group_company_policies', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      roster_group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'roster_groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      company_policy_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'company_policies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('roster_group_company_policies', ['roster_group_id', 'company_policy_id'], {
      unique: true,
      name: 'roster_group_company_policies_unique_pair',
    });
    await queryInterface.addIndex('roster_group_company_policies', ['company_policy_id'], {
      name: 'roster_group_company_policies_policy_id_idx',
    });

    // roster_group_leave_policies: many-to-many between Roster Group and
    // LeavePolicy, but constrained to AT MOST ONE policy per (roster_group,
    // leave_type) — leave_type_id is denormalized onto this join row
    // specifically to make that a plain unique index rather than a
    // cross-table constraint. A single LeavePolicy row (e.g. "10-day Special
    // Leave") can still be linked to several Roster Groups at once — they
    // simply share the identical quota rule.
    await queryInterface.createTable('roster_group_leave_policies', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
      roster_group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'roster_groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      leave_policy_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'leave_policies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      leave_type_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'leave_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('roster_group_leave_policies', ['roster_group_id', 'leave_type_id'], {
      unique: true,
      name: 'roster_group_leave_policies_one_per_type',
    });
    await queryInterface.addIndex('roster_group_leave_policies', ['leave_policy_id'], {
      name: 'roster_group_leave_policies_policy_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('roster_group_leave_policies');
    await queryInterface.dropTable('roster_group_company_policies');
    await queryInterface.dropTable('roster_group_holidays');
    await queryInterface.dropTable('roster_group_shifts');
  },
};
