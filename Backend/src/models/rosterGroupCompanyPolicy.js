'use strict';

const { Model } = require('sequelize');

// Join table for RosterGroup<->CompanyPolicy — many-to-many. A policy linked
// to specific Roster Group(s) is only shown to that Group's employees on the
// ESS "Company Policies" view (on top of company-wide-always-visible ones) —
// see companyPolicy.service.js::listCompanyPolicies.
module.exports = (sequelize, DataTypes) => {
  class RosterGroupCompanyPolicy extends Model {
    static associate(models) {
      RosterGroupCompanyPolicy.belongsTo(models.RosterGroup, { foreignKey: 'rosterGroupId', as: 'rosterGroup' });
      RosterGroupCompanyPolicy.belongsTo(models.CompanyPolicy, { foreignKey: 'companyPolicyId', as: 'companyPolicy' });
    }
  }

  RosterGroupCompanyPolicy.init(
    {
      rosterGroupId: { type: DataTypes.BIGINT, allowNull: false },
      companyPolicyId: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'RosterGroupCompanyPolicy',
      tableName: 'roster_group_company_policies',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      paranoid: false,
    }
  );

  return RosterGroupCompanyPolicy;
};
