'use strict';

const { Model } = require('sequelize');

// Join table for RosterGroup<->Shift. A Roster Group has at most one Shift
// (unique index on roster_group_id alone — see the create migration) —
// application-level rejection of a conflicting second assignment lives in
// shift.service.js, not here.
module.exports = (sequelize, DataTypes) => {
  class RosterGroupShift extends Model {
    static associate(models) {
      RosterGroupShift.belongsTo(models.RosterGroup, { foreignKey: 'rosterGroupId', as: 'rosterGroup' });
      RosterGroupShift.belongsTo(models.Shift, { foreignKey: 'shiftId', as: 'shift' });
    }
  }

  RosterGroupShift.init(
    {
      rosterGroupId: { type: DataTypes.BIGINT, allowNull: false },
      shiftId: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'RosterGroupShift',
      tableName: 'roster_group_shifts',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      paranoid: false,
    }
  );

  return RosterGroupShift;
};
