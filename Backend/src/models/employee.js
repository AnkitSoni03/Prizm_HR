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
      Employee.belongsTo(models.RosterGroup, { foreignKey: 'rosterGroupId', as: 'rosterGroup' });
      // Optional, admin-assigned enrollment in the comp-off benefit — see
      // compOff.service.js::checkAndCreateCompOffCredit, which returns
      // immediately (no credit) for an employee with this left null.
      Employee.belongsTo(models.CompOffPolicy, { foreignKey: 'compOffPolicyId', as: 'compOffPolicy' });
      Employee.hasMany(models.Employee, { foreignKey: 'managerId', as: 'directReports' });
      // Optional, admin-assigned dedicated Role holding this employee's
      // hand-picked "powers" — see employee.service.js::assignEmployeePowers.
      Employee.belongsTo(models.Role, { foreignKey: 'customRoleId', as: 'customRole' });
      Employee.belongsTo(models.User, { foreignKey: 'userId', as: 'loginUser' });
      Employee.hasOne(models.User, { foreignKey: 'employeeId', as: 'userAccount' });
      Employee.hasMany(models.EmployeeDocument, { foreignKey: 'employeeId', as: 'documents' });
      Employee.hasMany(models.DocumentUploadRequest, { foreignKey: 'employeeId', as: 'documentUploadRequests' });
      Employee.hasMany(models.Department, { foreignKey: 'headEmployeeId', as: 'headedDepartments' });
      Employee.hasMany(models.EmployeeShift, { foreignKey: 'employeeId', as: 'employeeShifts' });
      Employee.hasOne(models.EmployeeFaceProfile, { foreignKey: 'employeeId', as: 'faceProfile' });
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
      // Optional: Super Admin's minimal "name only" employee creation leaves
      // this unset — Company Admin/Brand Admin assign it later (part of
      // employee.service.js::UPDATABLE_FIELDS).
      employeeCode: { type: DataTypes.STRING, allowNull: true },
      companyId: { type: DataTypes.BIGINT, allowNull: false },
      // Nullable: a company with companies.uses_brands = false operates
      // directly at the Company level and its employees have no Brand.
      brandId: { type: DataTypes.BIGINT, allowNull: true },
      // Optional: Super Admin's minimal "name only" employee creation leaves
      // this null — Company Admin assigns it later via transferEmployee.
      departmentId: { type: DataTypes.BIGINT, allowNull: true },
      designationId: { type: DataTypes.BIGINT, allowNull: true },
      managerId: { type: DataTypes.BIGINT, allowNull: true },
      // Optional add-on: null keeps this employee on company/brand-wide
      // holidays, the company-wide leave policy, and their own
      // employee_shifts default — exactly as before this column existed.
      rosterGroupId: { type: DataTypes.BIGINT, allowNull: true },
      // Optional, admin-assigned Comp-Off Policy — null means this employee
      // is not enrolled in the comp-off benefit at all (no auto-credit on a
      // holiday/week-off worked, and the ESS "My Comp-Off" page shows a
      // not-enrolled state rather than an empty credits table).
      compOffPolicyId: { type: DataTypes.BIGINT, allowNull: true },
      customRoleId: { type: DataTypes.BIGINT, allowNull: true },
      userId: { type: DataTypes.BIGINT, allowNull: true },
      dateOfJoining: { type: DataTypes.DATEONLY, allowNull: true },
      // Optional — captured by Company Admin/Brand Admin when filling in an
      // employee's details, not required at creation.
      dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
      // Free text, not an ENUM — used for Professional Tax slab lookup only;
      // an unrecognized/blank value just falls back to the 'default' slab
      // (see statutoryDeduction.service.js).
      workState: { type: DataTypes.STRING, allowNull: true },
      // GCS object path (private bucket), not a public URL — resolved to a
      // signed download URL on read (see employee.service.js::withPhotoUrl).
      photoUrl: { type: DataTypes.STRING, allowNull: true },
      employmentType: {
        type: DataTypes.ENUM('full_time', 'part_time', 'contract', 'probation'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('onboarding', 'active', 'on_notice', 'exited', 'archived'),
        allowNull: false,
        defaultValue: 'onboarding',
      },
      // Separate from the HR-lifecycle `status` ENUM above — this is a plain
      // on/off account toggle (Company Admin/Brand Admin, "employee left,
      // don't delete their record") that also cascades to the linked User's
      // own isActive (see employee.service.js::setEmployeeActiveStatus), so
      // deactivating immediately blocks their ESS login. Never touched by
      // the generic updateEmployee path — only the dedicated
      // PATCH /employees/:id/active endpoint writes it.
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
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
