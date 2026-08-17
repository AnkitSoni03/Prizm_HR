'use strict';

// Replaces the single (company_id, leave_type_id) unique index with a
// partial-unique-index pair, same pattern as
// 20260717090400-add-active-structure-unique-index-to-employee-salary-structures.js
// (Postgres compiles Sequelize's addIndex `where` option to a real partial
// index): a company-wide default (roster_group_id IS NULL) and any number of
// per-roster-group overrides can now coexist, while still preventing two
// policies for the same (company, leaveType, same roster group).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeIndex('leave_policies', 'leave_policies_company_id_leave_type_id_unique');

    // At most one company-wide default policy per (company, leaveType).
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id'], {
      unique: true,
      name: 'leave_policies_company_wide_unique',
      where: { roster_group_id: null },
    });

    // At most one override per (company, leaveType, rosterGroup).
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id', 'roster_group_id'], {
      unique: true,
      name: 'leave_policies_roster_group_unique',
      where: { roster_group_id: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('leave_policies', 'leave_policies_roster_group_unique');
    await queryInterface.removeIndex('leave_policies', 'leave_policies_company_wide_unique');
    await queryInterface.addIndex('leave_policies', ['company_id', 'leave_type_id'], {
      unique: true,
      name: 'leave_policies_company_id_leave_type_id_unique',
    });
  },
};
