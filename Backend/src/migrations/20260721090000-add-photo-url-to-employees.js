'use strict';

// Stores a GCS object path (private bucket), same convention as
// company_policies.file_url — never a public URL. Resolved to a short-lived
// signed URL on read (see employee.service.js::withPhotoUrl). Nullable and
// optional: an employee with no uploaded photo simply falls back to a
// generic avatar icon on the frontend.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('employees', 'photo_url', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('employees', 'photo_url');
  },
};
