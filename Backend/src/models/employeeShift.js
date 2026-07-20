'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmployeeShift extends Model {
    static associate(models) {
      EmployeeShift.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      EmployeeShift.belongsTo(models.Shift, { foreignKey: 'shiftId', as: 'shift' });
    }
  }

  EmployeeShift.init(
    {
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      shiftId: { type: DataTypes.BIGINT, allowNull: false },
      effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    },
    {
      sequelize,
      modelName: 'EmployeeShift',
      tableName: 'employee_shifts',
      underscored: true,
      paranoid: true,
    }
  );

  return EmployeeShift;
};
