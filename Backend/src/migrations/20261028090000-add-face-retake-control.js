'use strict';

// employee_face_profiles.retake_allowed: once an employee has registered
// their face they can't replace it on their own — they request a retake and
// an admin turns this on from the employee's popup. Re-registering turns it
// back off. Every existing profile starts locked (false); no face data is
// touched.
// retake_requested_at: set when the employee asks, cleared when the admin
// decides or the face is re-registered.
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('employee_face_profiles');
    if (!table.retake_allowed) {
      await queryInterface.addColumn('employee_face_profiles', 'retake_allowed', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!table.retake_requested_at) {
      await queryInterface.addColumn('employee_face_profiles', 'retake_requested_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employee_face_profiles', 'retake_requested_at');
    await queryInterface.removeColumn('employee_face_profiles', 'retake_allowed');
  },
};
