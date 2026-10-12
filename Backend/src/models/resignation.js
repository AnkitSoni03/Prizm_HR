'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Resignation extends Model {
    static associate(models) {
      Resignation.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Resignation.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      Resignation.belongsTo(models.User, { foreignKey: 'decidedByUserId', as: 'decidedByUser' });
      Resignation.belongsTo(models.Employee, { foreignKey: 'decidedByEmployeeId', as: 'decidedByEmployee' });
    }
  }

  Resignation.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      reason: { type: DataTypes.TEXT, allowNull: false },
      requestedLastWorkingDate: { type: DataTypes.DATEONLY, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'withdrawn'),
        allowNull: false,
        defaultValue: 'pending',
      },
      lastWorkingDate: { type: DataTypes.DATEONLY, allowNull: true },
      decisionComment: { type: DataTypes.TEXT, allowNull: true },
      decidedByUserId: { type: DataTypes.BIGINT, allowNull: true },
      decidedByEmployeeId: { type: DataTypes.BIGINT, allowNull: true },
      decidedAt: { type: DataTypes.DATE, allowNull: true },
      withdrawnAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Resignation',
      tableName: 'resignations',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Resignation);

  return Resignation;
};
