'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Shift extends Model {
    static associate(models) {
      Shift.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Shift.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      Shift.hasMany(models.EmployeeShift, { foreignKey: 'shiftId', as: 'employeeShifts' });
      Shift.hasMany(models.ShiftRoster, { foreignKey: 'shiftId', as: 'rosterEntries' });
      Shift.belongsToMany(models.RosterGroup, {
        through: models.RosterGroupShift,
        foreignKey: 'shiftId',
        otherKey: 'rosterGroupId',
        as: 'rosterGroups',
      });
    }
  }

  Shift.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      // NULL = shared across every Brand in the company. See utils/brandScope.js.
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      name: { type: DataTypes.STRING, allowNull: false },
      startTime: { type: DataTypes.TIME, allowNull: false },
      endTime: { type: DataTypes.TIME, allowNull: false },
      isNightShift: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Day-of-week ints matching JS Date#getDay() (0=Sunday..6=Saturday).
      // Feeds the shared isWorkingDay utility (src/utils/workingDays.js)
      // used by leave day-counting and comp-off auto-detection.
      weeklyOffDays: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
      // Only meaningful when weeklyOffDays is empty — null means a normal
      // Shift (has real weekly-off days, the choice never applies) or a
      // 0-weekly-off Shift whose admin hasn't decided yet; true/false is an
      // explicit choice. See weekOffLeave.service.js.
      weekOffLeaveEnabled: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: null },
      // Day(s)-of-week (0=Sunday..6=Saturday) that count toward the monthly
      // Week Off Leave quota when weekOffLeaveEnabled is true — generalizes
      // the old hardcoded "Sunday only" assumption.
      weekOffLeaveBasisDays: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: false, defaultValue: [] },
    },
    {
      sequelize,
      modelName: 'Shift',
      tableName: 'shifts',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Shift);

  return Shift;
};
