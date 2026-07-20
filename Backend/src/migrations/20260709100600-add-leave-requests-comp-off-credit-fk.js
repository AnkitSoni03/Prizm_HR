'use strict';

// leave_requests.comp_off_credit_id was created as a plain BIGINT in
// 20260709100400-create-leave-requests.js because comp_off_credits didn't
// exist yet at that point in the build order (same deferred-FK pattern as
// 20260707121600-add-deferred-foreign-keys.js). Adds the real constraint now
// that comp_off_credits exists, plus the uniqueness guarantee that a given
// credit can only ever be linked to one leave request.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('leave_requests', {
      fields: ['comp_off_credit_id'],
      type: 'foreign key',
      name: 'fk_leave_requests_comp_off_credit_id_comp_off_credits',
      references: { table: 'comp_off_credits', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('leave_requests', ['comp_off_credit_id'], {
      unique: true,
      name: 'leave_requests_comp_off_credit_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('leave_requests', 'leave_requests_comp_off_credit_id_unique');
    await queryInterface.removeConstraint('leave_requests', 'fk_leave_requests_comp_off_credit_id_comp_off_credits');
  },
};
