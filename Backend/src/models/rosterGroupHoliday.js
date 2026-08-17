'use strict';

const { Model } = require('sequelize');

// Join table for RosterGroup<->Holiday — genuinely many-to-many.
module.exports = (sequelize, DataTypes) => {
  class RosterGroupHoliday extends Model {
    static associate(models) {
      RosterGroupHoliday.belongsTo(models.RosterGroup, { foreignKey: 'rosterGroupId', as: 'rosterGroup' });
      RosterGroupHoliday.belongsTo(models.Holiday, { foreignKey: 'holidayId', as: 'holiday' });
    }
  }

  RosterGroupHoliday.init(
    {
      rosterGroupId: { type: DataTypes.BIGINT, allowNull: false },
      holidayId: { type: DataTypes.BIGINT, allowNull: false },
    },
    {
      sequelize,
      modelName: 'RosterGroupHoliday',
      tableName: 'roster_group_holidays',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      paranoid: false,
    }
  );

  return RosterGroupHoliday;
};
