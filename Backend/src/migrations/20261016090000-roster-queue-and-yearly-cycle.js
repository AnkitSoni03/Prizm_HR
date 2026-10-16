'use strict';

// Roster queue + "Yearly Roster Update":
//   - companies.yearly_cycle_start_month (1-12, default 1 = Jan–Dec): the
//     company's yearly renewal cycle — leave balances renew (with capped
//     carry-forward) on the 1st of this month. employees.yearly_cycle_start_month
//     overrides it per employee (null = use the company's).
//   - employees.next_roster_group_id: the queued Roster a Probation/Intern
//     employee moves to automatically the day after their period ends
//     (jobs/probationConversion.job.js). Cleared once applied.
//   - employees.probation_period_unit: probation_period_days now holds a
//     number of 'days' (existing rows) or 'months'.
//   - employees.confirmed_on: the day the employee left Probation/Intern —
//     their first post-probation leave period starts here.
//   - Rosters never expire anymore: roster_groups.validity_value/unit and
//     employees.roster_expiry_notified_threshold_days are dropped.
//   - roster_transfer_logs.actor_user_id is nullable: the automatic
//     probation-end switch has no acting user.
module.exports = {
  async up(queryInterface, Sequelize) {
    const companies = await queryInterface.describeTable('companies');
    if (!companies.yearly_cycle_start_month) {
      await queryInterface.addColumn('companies', 'yearly_cycle_start_month', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
    }

    const employees = await queryInterface.describeTable('employees');
    if (!employees.yearly_cycle_start_month) {
      await queryInterface.addColumn('employees', 'yearly_cycle_start_month', { type: Sequelize.INTEGER, allowNull: true });
    }
    if (!employees.next_roster_group_id) {
      await queryInterface.addColumn('employees', 'next_roster_group_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: { model: 'roster_groups', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
    if (!employees.probation_period_unit) {
      await queryInterface.addColumn('employees', 'probation_period_unit', {
        type: Sequelize.ENUM('days', 'months'),
        allowNull: false,
        defaultValue: 'days',
      });
    }
    if (!employees.confirmed_on) {
      await queryInterface.addColumn('employees', 'confirmed_on', { type: Sequelize.DATEONLY, allowNull: true });
    }
    if (employees.roster_expiry_notified_threshold_days) {
      await queryInterface.removeColumn('employees', 'roster_expiry_notified_threshold_days');
    }

    const rosterGroups = await queryInterface.describeTable('roster_groups');
    if (rosterGroups.validity_value) await queryInterface.removeColumn('roster_groups', 'validity_value');
    if (rosterGroups.validity_unit) await queryInterface.removeColumn('roster_groups', 'validity_unit');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_roster_groups_validity_unit";');

    await queryInterface.changeColumn('roster_transfer_logs', 'actor_user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('roster_groups', 'validity_value', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('roster_groups', 'validity_unit', { type: Sequelize.ENUM('days', 'months'), allowNull: true });
    await queryInterface.addColumn('employees', 'roster_expiry_notified_threshold_days', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.removeColumn('employees', 'confirmed_on');
    await queryInterface.removeColumn('employees', 'probation_period_unit');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_employees_probation_period_unit";');
    await queryInterface.removeColumn('employees', 'next_roster_group_id');
    await queryInterface.removeColumn('employees', 'yearly_cycle_start_month');
    await queryInterface.removeColumn('companies', 'yearly_cycle_start_month');
  },
};
