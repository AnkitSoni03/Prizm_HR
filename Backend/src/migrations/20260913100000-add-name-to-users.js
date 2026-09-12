'use strict';

const { DataTypes } = require('sequelize');

// Admin-only accounts (Super Admin, Group Admin, Company Admin, Brand Admin —
// anyone with no linked Employee record) had no display name anywhere in the
// schema, so the Topbar/sidebar fell back to showing their raw email
// (auth.service.js::getCurrentUser). Employee-linked accounts are unaffected
// — their name still comes from employees.name and continues to win when
// both exist (see the updated getCurrentUser priority).
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('users', 'name', {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'name');
  },
};
