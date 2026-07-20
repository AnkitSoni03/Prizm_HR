'use strict';

// Without these, the seeders' `ignoreDuplicates: true` (ON CONFLICT DO
// NOTHING) has no unique constraint to key off, so re-running db:seed:all
// silently inserts duplicate role rows instead of skipping them.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('roles', ['company_id', 'name'], {
      unique: true,
      name: 'roles_company_id_name_unique',
    });

    await queryInterface.addIndex('roles', ['name'], {
      unique: true,
      where: { company_id: null },
      name: 'roles_system_name_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('roles', 'roles_system_name_unique');
    await queryInterface.removeIndex('roles', 'roles_company_id_name_unique');
  },
};
