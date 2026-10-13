'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

// One employee's payroll for one completed month — see migration
// 20261013090400 for the lifecycle (generate → recalculate → carry the
// difference into the next month).
module.exports = (sequelize, DataTypes) => {
  class EmployeePayroll extends Model {
    static associate(models) {
      EmployeePayroll.belongsTo(models.Employee, { foreignKey: 'employeeId', as: 'employee' });
      EmployeePayroll.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      EmployeePayroll.belongsTo(models.SalaryAssignment, { foreignKey: 'assignmentId', as: 'assignment' });
    }
  }

  // DECIMAL columns come back from pg as strings — expose them as numbers so
  // every consumer (API JSON, PDF, engine) gets plain numbers.
  const decimal = (name, precision = [14, 2], extra = {}) => ({
    type: DataTypes.DECIMAL(...precision),
    allowNull: false,
    ...extra,
    get() {
      const raw = this.getDataValue(name);
      return raw === null || raw === undefined ? raw : Number(raw);
    },
  });

  EmployeePayroll.init(
    {
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      groupId: { type: DataTypes.BIGINT, allowNull: false },
      employeeId: { type: DataTypes.BIGINT, allowNull: false },
      assignmentId: { type: DataTypes.BIGINT, allowNull: true },
      periodYear: { type: DataTypes.INTEGER, allowNull: false },
      periodMonth: { type: DataTypes.INTEGER, allowNull: false },
      periodStart: { type: DataTypes.DATEONLY, allowNull: false },
      periodEnd: { type: DataTypes.DATEONLY, allowNull: false },
      monthDays: decimal('monthDays', [5, 2]),
      paidDays: decimal('paidDays', [5, 2]),
      lopDays: decimal('lopDays', [5, 2]),
      monthlyCtc: decimal('monthlyCtc'),
      grossFull: decimal('grossFull'),
      grossEarned: decimal('grossEarned'),
      totalDeductions: decimal('totalDeductions'),
      totalEmployer: decimal('totalEmployer'),
      carryAdjustment: decimal('carryAdjustment', [14, 2], { defaultValue: 0 }),
      netPay: decimal('netPay'),
      originalNet: decimal('originalNet'),
      details: { type: DataTypes.JSONB, allowNull: false },
      rulesSnapshot: { type: DataTypes.JSONB, allowNull: false },
      revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      revisedAt: { type: DataTypes.DATE, allowNull: true },
      generatedAt: { type: DataTypes.DATE, allowNull: false },
      needsRecalc: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      payslipReleased: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      releasedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'EmployeePayroll',
      tableName: 'employee_payrolls',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(EmployeePayroll);

  return EmployeePayroll;
};
