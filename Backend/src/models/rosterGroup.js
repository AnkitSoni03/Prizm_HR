'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class RosterGroup extends Model {
    static associate(models) {
      RosterGroup.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      RosterGroup.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      RosterGroup.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'updater' });
      RosterGroup.hasMany(models.Employee, { foreignKey: 'rosterGroupId', as: 'employees' });
      // Assignment now happens from each entity's OWN create/edit form
      // ("Assign to Roster(s)"), not from this Roster Group's own page —
      // see roster_group_shifts/holidays/company_policies/leave_policies.
      RosterGroup.belongsToMany(models.Shift, {
        through: models.RosterGroupShift,
        foreignKey: 'rosterGroupId',
        otherKey: 'shiftId',
        as: 'shifts',
      });
      RosterGroup.belongsToMany(models.Holiday, {
        through: models.RosterGroupHoliday,
        foreignKey: 'rosterGroupId',
        otherKey: 'holidayId',
        as: 'holidays',
      });
      RosterGroup.belongsToMany(models.CompanyPolicy, {
        through: models.RosterGroupCompanyPolicy,
        foreignKey: 'rosterGroupId',
        otherKey: 'companyPolicyId',
        as: 'companyPolicies',
      });
      RosterGroup.belongsToMany(models.LeavePolicy, {
        through: models.RosterGroupLeavePolicy,
        foreignKey: 'rosterGroupId',
        otherKey: 'leavePolicyId',
        as: 'leavePolicies',
      });
    }
  }

  RosterGroup.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.STRING, allowNull: true },
      createdBy: { type: DataTypes.BIGINT, allowNull: true },
      updatedBy: { type: DataTypes.BIGINT, allowNull: true },
      // Optional validity period ("6 months", "45 days") — both null means
      // no expiry (default, unchanged behavior). Anchored per-employee at
      // assignment time, not to the Roster itself — see
      // employees.roster_assigned_at.
      validityValue: { type: DataTypes.INTEGER, allowNull: true },
      validityUnit: { type: DataTypes.ENUM('days', 'months'), allowNull: true },
    },
    {
      sequelize,
      modelName: 'RosterGroup',
      tableName: 'roster_groups',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(RosterGroup);

  return RosterGroup;
};
