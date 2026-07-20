'use strict';

// These 6 FKs point at tables that don't exist yet at the point their owning
// table is created (circular dependency chains such as
// groups -> users -> companies -> groups). The columns are created as plain
// BIGINT earlier; this migration adds the actual constraints once every
// table in the Phase-1 set exists.
const DEFERRED_FKS = [
  {
    table: 'groups',
    field: 'created_by',
    refTable: 'users',
    name: 'fk_groups_created_by_users',
    onDelete: 'SET NULL',
  },
  {
    table: 'companies',
    field: 'created_by',
    refTable: 'users',
    name: 'fk_companies_created_by_users',
    onDelete: 'SET NULL',
  },
  {
    table: 'users',
    field: 'employee_id',
    refTable: 'employees',
    name: 'fk_users_employee_id_employees',
    onDelete: 'SET NULL',
  },
  {
    table: 'user_roles',
    field: 'brand_id',
    refTable: 'brands',
    name: 'fk_user_roles_brand_id_brands',
    onDelete: 'SET NULL',
  },
  {
    table: 'invitations',
    field: 'brand_id',
    refTable: 'brands',
    name: 'fk_invitations_brand_id_brands',
    onDelete: 'SET NULL',
  },
  {
    table: 'departments',
    field: 'head_employee_id',
    refTable: 'employees',
    name: 'fk_departments_head_employee_id_employees',
    onDelete: 'SET NULL',
  },
];

module.exports = {
  async up(queryInterface) {
    for (const fk of DEFERRED_FKS) {
      await queryInterface.addConstraint(fk.table, {
        fields: [fk.field],
        type: 'foreign key',
        name: fk.name,
        references: { table: fk.refTable, field: 'id' },
        onUpdate: 'CASCADE',
        onDelete: fk.onDelete,
      });
    }
  },

  async down(queryInterface) {
    for (const fk of DEFERRED_FKS) {
      await queryInterface.removeConstraint(fk.table, fk.name);
    }
  },
};
