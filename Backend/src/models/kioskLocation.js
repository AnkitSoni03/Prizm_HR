'use strict';

const { Model } = require('sequelize');

// Group-level, NOT company-level — deliberately does not call
// applyTenantScope: a Group spans companies, so the company_id tenant hook
// would filter every row out (there is no company_id column at all here).
// Scoping is enforced explicitly by group_id / kiosk_user_id in
// kioskLocation.service.js instead.
module.exports = (sequelize, DataTypes) => {
  class KioskLocation extends Model {
    static associate(models) {
      KioskLocation.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' });
      KioskLocation.belongsTo(models.User, { foreignKey: 'kioskUserId', as: 'kioskUser' });
      KioskLocation.hasMany(models.Attendance, { foreignKey: 'kioskLocationId', as: 'attendanceRecords' });
    }
  }

  KioskLocation.init(
    {
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      kioskUserId: { type: DataTypes.BIGINT, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      activeSessionId: { type: DataTypes.STRING, allowNull: true },
      sessionClaimedAt: { type: DataTypes.DATE, allowNull: true },
      sessionLastSeenAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'KioskLocation',
      tableName: 'kiosk_locations',
      underscored: true,
      paranoid: true,
    }
  );

  return KioskLocation;
};
