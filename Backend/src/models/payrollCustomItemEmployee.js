'use strict';

const { Model } = require('sequelize');

// Which employees an extra allowance / deduction / employer contribution
// (payroll_custom_items) applies to. Group-level, not tenant-scoped — every
// query filters on group_id / employee_id. A removed employee is soft-deleted;
// the partial unique index allows adding them back.
module.exports = (sequelize, DataTypes) => {
  class PayrollCustomItemEmployee extends Model {
    static associate(models) {
      PayrollCustomItemEmployee.belongsTo(models.PayrollCustomItem, { foreignKey: 'customItemId', as: 'item' });
      PayrollCustomItemEmployee.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
    }
  }

  PayrollCustomItemEmployee.init(
    {
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      customItemId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      createdByUserId: { type: DataTypes.BIGINT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PayrollCustomItemEmployee',
      tableName: 'payroll_custom_item_employees',
      underscored: true,
      paranoid: true,
    }
  );

  return PayrollCustomItemEmployee;
};
