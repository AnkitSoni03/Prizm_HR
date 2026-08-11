'use strict';

// Tears down the "is HR department" auto-grant feature (department.service.js's
// isHrDepartment handling and hrTeamSync.js, both deleted alongside this
// migration) — removed because it fully duplicated what the per-employee
// "Powers" feature (assignEmployeePowers/powerCatalog.js, the 'holidays' +
// 'assign_leaves' bundles) already does with finer, per-employee control.
// The companion migration 20260810090000 already retroactively granted those
// same two Powers to every employee who held the HR Team role, so no access
// is lost here.
module.exports = {
  async up(queryInterface, Sequelize) {
    const [hrTeamRole] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE is_system = true AND name = 'HR Team'`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (hrTeamRole) {
      await queryInterface.sequelize.query(
        `DELETE FROM user_roles WHERE role_id = :roleId`,
        { replacements: { roleId: hrTeamRole.id } }
      );
      await queryInterface.sequelize.query(
        `DELETE FROM role_permissions WHERE role_id = :roleId`,
        { replacements: { roleId: hrTeamRole.id } }
      );
      await queryInterface.sequelize.query(
        `DELETE FROM roles WHERE id = :roleId`,
        { replacements: { roleId: hrTeamRole.id } }
      );
    }

    await queryInterface.removeColumn('departments', 'is_hr_department');
  },

  // Role deletion isn't reversed (an admin may since have changed the Powers
  // this was replaced by — restoring the old role/grants blind could
  // resurrect access an admin deliberately revoked), same reasoning as other
  // not-fully-reversed backfills in this repo. down() only restores the
  // column so the migration stays reversible at the schema level.
  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('departments', 'is_hr_department', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
};
