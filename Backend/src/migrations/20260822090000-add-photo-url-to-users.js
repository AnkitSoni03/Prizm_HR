'use strict';

// Same convention as employees.photo_url (see
// 20260721090000-add-photo-url-to-employees.js): stores a GCS object path
// (private bucket), never a public URL, resolved to a short-lived signed URL
// on read. This is specifically for admin-only accounts (Super Admin, Group
// Admin, Company Admin, Brand Admin, etc.) that have no linked Employee row
// and therefore can't rely on employees.photo_url — see
// auth.service.js::getCurrentUser, which already resolves name/photo/
// designation from Employee when employeeId is set. Nullable and optional,
// same as the employee column.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'photo_url', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'photo_url');
  },
};
