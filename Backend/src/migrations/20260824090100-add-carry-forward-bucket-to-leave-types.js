'use strict';

// Backs the "Carry Forward Leaves" bucket created by
// rosterTransfer.service.js when an employee's new Roster doesn't govern a
// leave type their old Roster did, but the admin still chose to carry the
// remainder forward. is_carry_forward_bucket marks the row as system-
// generated (excluded from the normal "Add Leave Type" catalog pickers);
// source_leave_type_id remembers which original type it was split off from,
// so a later roster change can find-and-reuse the same bucket type instead
// of creating a new one every time.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_types', 'is_carry_forward_bucket', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('leave_types', 'source_leave_type_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'leave_types', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('leave_types', 'source_leave_type_id');
    await queryInterface.removeColumn('leave_types', 'is_carry_forward_bucket');
  },
};
