'use strict';

// percentage_of_component_id was created as a plain BIGINT in
// 20260717090100-create-salary-component-definitions.js because it's a
// self-reference and the table didn't exist yet at that point in its own
// creation (same deferred-FK pattern as
// 20260709100600-add-leave-requests-comp-off-credit-fk.js). Cycles (A % of
// B, B % of A) are rejected in service logic at structure-assignment time —
// Postgres has no declarative way to forbid them.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('salary_component_definitions', {
      fields: ['percentage_of_component_id'],
      type: 'foreign key',
      name: 'fk_salary_component_definitions_percentage_of_component_id',
      references: { table: 'salary_component_definitions', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      'salary_component_definitions',
      'fk_salary_component_definitions_percentage_of_component_id'
    );
  },
};
