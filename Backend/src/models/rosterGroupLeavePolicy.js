'use strict';

const { Model } = require('sequelize');

// Join table for RosterGroup<->LeavePolicy. leaveTypeId is denormalized onto
// this row (not just derivable via leavePolicyId) specifically so a plain
// unique index on (rosterGroupId, leaveTypeId) enforces "at most one policy
// per leave type per Roster Group" — see the create migration.
module.exports = (sequelize, DataTypes) => {
  class RosterGroupLeavePolicy extends Model {
    static associate(models) {
      RosterGroupLeavePolicy.belongsTo(models.RosterGroup, { foreignKey: 'rosterGroupId', as: 'rosterGroup' });
      RosterGroupLeavePolicy.belongsTo(models.LeavePolicy, { foreignKey: 'leavePolicyId', as: 'leavePolicy' });
      RosterGroupLeavePolicy.belongsTo(models.LeaveType, { foreignKey: 'leaveTypeId', as: 'leaveType' });
    }
  }

  RosterGroupLeavePolicy.init(
    {
      rosterGroupId: { type: DataTypes.BIGINT, allowNull: false },
      leavePolicyId: { type: DataTypes.BIGINT, allowNull: false },
      leaveTypeId: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'RosterGroupLeavePolicy',
      tableName: 'roster_group_leave_policies',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      paranoid: false,
    }
  );

  return RosterGroupLeavePolicy;
};
