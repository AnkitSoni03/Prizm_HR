'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class RosterTransferLog extends Model {
    static associate(models) {
      RosterTransferLog.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      RosterTransferLog.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      RosterTransferLog.belongsTo(models.RosterGroup, { foreignKey: 'fromRosterGroupId', as: 'fromRosterGroup' });
      RosterTransferLog.belongsTo(models.RosterGroup, { foreignKey: 'toRosterGroupId', as: 'toRosterGroup' });
      RosterTransferLog.belongsTo(models.User, { foreignKey: 'actorUserId', as: 'actorUser' });
    }
  }

  RosterTransferLog.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      fromRosterGroupId: { type: DataTypes.BIGINT, allowNull: true },
      toRosterGroupId: { type: DataTypes.BIGINT, allowNull: true },
      carryForward: { type: DataTypes.BOOLEAN, allowNull: false },
      actorUserId: { type: DataTypes.BIGINT, allowNull: false },
      details: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    },
    {
      sequelize,
      modelName: 'RosterTransferLog',
      tableName: 'roster_transfer_logs',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(RosterTransferLog);

  return RosterTransferLog;
};
