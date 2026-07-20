'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class CompanyPolicy extends Model {
    static associate(models) {
      CompanyPolicy.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      CompanyPolicy.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
      CompanyPolicy.belongsTo(models.User, { foreignKey: 'updatedBy', as: 'updater' });
    }
  }

  CompanyPolicy.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: true },
      // Plain URL string, same convention as employee_documents.fileUrl —
      // no real file-upload backend exists anywhere in this app.
      fileUrl: { type: DataTypes.STRING, allowNull: true },
      createdBy: { type: DataTypes.BIGINT, allowNull: true },
      updatedBy: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'CompanyPolicy',
      tableName: 'company_policies',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(CompanyPolicy);

  return CompanyPolicy;
};
