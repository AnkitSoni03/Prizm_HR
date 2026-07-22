'use strict';

const { Model } = require('sequelize');
const { applyTenantScope } = require('./hooks/tenant-scope');

module.exports = (sequelize, DataTypes) => {
  class Employee extends Model {
    static associate(models) {
      Employee.belongsTo(models.Company, { foreignKey: 'companyId', as: 'company' });
      Employee.belongsTo(models.Brand, { foreignKey: 'brandId', as: 'brand' });
      Employee.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
      Employee.belongsTo(models.Designation, { foreignKey: 'designationId', as: 'designation' });
      Employee.belongsTo(models.Employee, { foreignKey: 'managerId', as: 'manager' });
      Employee.hasMany(models.Employee, { foreignKey: 'managerId', as: 'directReports' });
      // Optional, admin-assigned dedicated Role holding this employee's
      // hand-picked "powers" — see employee.service.js::assignEmployeePowers.
      Employee.belongsTo(models.Role, { foreignKey: 'customRoleId', as: 'customRole' });
      Employee.belongsTo(models.User, { foreignKey: 'userId', as: 'loginUser' });
      Employee.hasOne(models.User, { foreignKey: 'employeeId', as: 'userAccount' });
      Employee.hasMany(models.EmployeeDocument, { foreignKey: 'employeeId', as: 'documents' });
      Employee.hasMany(models.Department, { foreignKey: 'headEmployeeId', as: 'headedDepartments' });
      Employee.hasMany(models.EmployeeShift, { foreignKey: 'employeeId', as: 'employeeShifts' });
      Employee.hasMany(models.EmployeeDevice, { foreignKey: 'employeeId', as: 'devices' });
      Employee.hasMany(models.ShiftRoster, { foreignKey: 'employeeId', as: 'rosterEntries' });
      Employee.hasMany(models.ShiftRoster, { foreignKey: 'publishedBy', as: 'publishedRosters' });
      Employee.hasMany(models.Attendance, { foreignKey: 'employeeId', as: 'attendanceRecords' });
      Employee.hasMany(models.AttendanceRegularization, { foreignKey: 'employeeId', as: 'regularizations' });
      Employee.hasMany(models.AttendanceRegularization, { foreignKey: 'approverId', as: 'approvedRegularizations' });
      Employee.hasMany(models.OdRequest, { foreignKey: 'employeeId', as: 'odRequests' });
      Employee.hasMany(models.OdRequest, { foreignKey: 'approverId', as: 'approvedOdRequests' });
      Employee.hasMany(models.LeaveBalance, { foreignKey: 'employeeId', as: 'leaveBalances' });
      Employee.hasMany(models.LeaveRequest, { foreignKey: 'employeeId', as: 'leaveRequests' });
      Employee.hasMany(models.LeaveRequest, { foreignKey: 'approverId', as: 'approvedLeaveRequests' });
      Employee.hasMany(models.CompOffCredit, { foreignKey: 'employeeId', as: 'compOffCredits' });
      Employee.hasMany(models.CompOffCredit, { foreignKey: 'approverId', as: 'approvedCompOffCredits' });
      Employee.hasMany(models.EmployeeSalaryStructure, { foreignKey: 'employeeId', as: 'salaryStructures' });
      Employee.hasMany(models.Payslip, { foreignKey: 'employeeId', as: 'payslips' });
      Employee.hasMany(models.PayrollAdjustment, { foreignKey: 'employeeId', as: 'payrollAdjustments' });
    }
  }

  Employee.init(
    {
      name: { type: DataTypes.STRING, allowNull: true },
      employeeCode: { type: DataTypes.STRING, allowNull: false },
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      // Nullable: a company with companies.uses_brands = false operates
      // directly at the Company level and its employees have no Brand.
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      departmentId: { type: DataTypes.BIGINT, allowNull: false },
      designationId: { type: DataTypes.BIGINT, allowNull: true },
      managerId: { type: DataTypes.BIGINT, allowNull: true },
      customRoleId: { type: DataTypes.BIGINT, allowNull: true },
      userId: { type: DataTypes.BIGINT, allowNull: true },
      dateOfJoining: { type: DataTypes.DATEONLY, allowNull: true },
      // Free text, not an ENUM — used for Professional Tax slab lookup only;
      // an unrecognized/blank value just falls back to the 'default' slab
      // (see statutoryDeduction.service.js).
      workState: { type: DataTypes.STRING, allowNull: true },
      // GCS object path (private bucket), not a public URL — resolved to a
      // signed download URL on read (see employee.service.js::withPhotoUrl).
      photoUrl: { type: DataTypes.STRING, allowNull: true },
      employmentType: {
        type: DataTypes.ENUM('full_time', 'part_time', 'contract'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('onboarding', 'active', 'on_notice', 'exited', 'archived'),
        allowNull: false,
        defaultValue: 'onboarding',
      },
    },
    {
      sequelize,
      modelName: 'Employee',
      tableName: 'employees',
      underscored: true,
      paranoid: true,
    }
  );

  applyTenantScope(Employee);

  return Employee;
};
