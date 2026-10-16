'use strict';

// Leave balances move from "one row per (leave type, cycle key)" to "one row
// per (leave type, period)", where a period is either:
//   - a Probation/Intern period: DOJ until the employee is confirmed
//     (period_end stays NULL while it is still running — it does NOT roll
//     over on the yearly cycle date), or
//   - a yearly cycle (companies/employees.yearly_cycle_start_month), starting
//     later than the cycle's 1st when the employee joined/was confirmed
//     inside it.
// See utils/leavePeriod.js. leave_types' own cycle (cycle_type /
// custom_cycle_start_month / custom_cycle_start_day) is removed — the yearly
// cycle now comes from the company/employee only.
// leave_balances.carried_forward records the carried-in part of `allotted`.
//
// Existing rows keep their numbers; this only stamps the period they already
// covered (from the old cycle settings), then re-keys the CURRENT row of
// every employee who is still in Probation/Intern onto their probation period
// so their running balance (and its `used`) carries on instead of a fresh
// row being created next to it.
module.exports = {
  async up(queryInterface, Sequelize) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    const table = await queryInterface.describeTable('leave_balances');
    if (!table.period_start) {
      await queryInterface.addColumn('leave_balances', 'period_start', { type: Sequelize.DATEONLY, allowNull: true });
    }
    if (!table.period_end) {
      await queryInterface.addColumn('leave_balances', 'period_end', { type: Sequelize.DATEONLY, allowNull: true });
    }
    // How much of `allotted` was carried in from the previous period —
    // kept separately so monthly accrual can recompute its own share without
    // wiping the carried amount, and so the employee can see it.
    if (!table.carried_forward) {
      await queryInterface.addColumn('leave_balances', 'carried_forward', {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }

    // Month-grain ('monthly_reset') rows: that calendar month.
    await q(`
      UPDATE leave_balances
      SET period_start = make_date(year, month, 1),
          period_end = (make_date(year, month, 1) + interval '1 month' - interval '1 day')::date
      WHERE month IS NOT NULL AND period_start IS NULL;
    `);

    // Year-grain rows: the cycle their old key stood for.
    const leaveTypes = await queryInterface.describeTable('leave_types');
    if (leaveTypes.cycle_type) {
      await q(`
        UPDATE leave_balances lb
        SET period_start = s.start_date,
            period_end = (s.start_date + interval '1 year' - interval '1 day')::date
        FROM (
          SELECT lb2.id,
            CASE
              WHEN lt.cycle_type::text = 'custom' AND lt.custom_cycle_start_month IS NOT NULL AND lt.custom_cycle_start_day IS NOT NULL
                THEN (make_date(lb2.year, lt.custom_cycle_start_month, 1) + (lt.custom_cycle_start_day - 1))::date
              WHEN lt.cycle_type::text = 'anniversary' AND e.date_of_joining IS NOT NULL
                THEN (e.date_of_joining + make_interval(years => lb2.year - 1))::date
              ELSE make_date(lb2.year, 1, 1)
            END AS start_date
          FROM leave_balances lb2
          JOIN leave_types lt ON lt.id = lb2.leave_type_id
          JOIN employees e ON e.id = lb2.employee_id
          WHERE lb2.month IS NULL AND lb2.period_start IS NULL
        ) s
        WHERE lb.id = s.id;
      `);
    }
    // Anything left (orphaned type/employee): plain calendar year.
    await q(`
      UPDATE leave_balances
      SET period_start = make_date(year, 1, 1), period_end = make_date(year, 12, 31)
      WHERE month IS NULL AND period_start IS NULL;
    `);

    // `year` is now simply the calendar year the period starts in (it held an
    // employment-year number for 'anniversary' types) — the old unique index
    // on (employee, type, year) has to go first.
    await q('DROP INDEX IF EXISTS leave_balances_employee_id_leave_type_id_year_unique;');
    await q(`
      UPDATE leave_balances
      SET year = EXTRACT(YEAR FROM period_start)::int
      WHERE month IS NULL AND year <> EXTRACT(YEAR FROM period_start)::int;
    `);

    // Still in Probation/Intern: their latest started row becomes the open
    // probation period (DOJ → until confirmed).
    await q(`
      UPDATE leave_balances lb
      SET period_start = e.date_of_joining,
          period_end = NULL,
          year = EXTRACT(YEAR FROM e.date_of_joining)::int
      FROM (
        SELECT DISTINCT ON (employee_id, leave_type_id) id
        FROM leave_balances
        WHERE month IS NULL AND deleted_at IS NULL AND period_start <= CURRENT_DATE
        ORDER BY employee_id, leave_type_id, period_start DESC
      ) latest,
      employees e
      WHERE lb.id = latest.id
        AND e.id = lb.employee_id
        AND e.deleted_at IS NULL
        AND e.employment_type::text IN ('probation', 'intern')
        AND e.probation_period_days IS NOT NULL
        AND e.date_of_joining IS NOT NULL
        AND lb.period_start <> e.date_of_joining
        AND NOT EXISTS (
          SELECT 1 FROM leave_balances x
          WHERE x.employee_id = lb.employee_id
            AND x.leave_type_id = lb.leave_type_id
            AND x.month IS NULL
            AND x.deleted_at IS NULL
            AND x.period_start = e.date_of_joining
        );
    `);

    // Defensive: two live rows for the same period (only possible if a leave
    // type's cycle was switched back and forth) — keep the latest-updated one.
    await q(`
      UPDATE leave_balances lb
      SET deleted_at = NOW()
      FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY employee_id, leave_type_id, period_start ORDER BY updated_at DESC, id DESC
        ) AS rn
        FROM leave_balances
        WHERE month IS NULL AND deleted_at IS NULL
      ) d
      WHERE lb.id = d.id AND d.rn > 1;
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_employee_type_period_unique
      ON leave_balances (employee_id, leave_type_id, period_start)
      WHERE month IS NULL AND deleted_at IS NULL;
    `);
    await queryInterface.changeColumn('leave_balances', 'period_start', { type: Sequelize.DATEONLY, allowNull: false });

    if (leaveTypes.cycle_type) await queryInterface.removeColumn('leave_types', 'cycle_type');
    if (leaveTypes.custom_cycle_start_month) await queryInterface.removeColumn('leave_types', 'custom_cycle_start_month');
    if (leaveTypes.custom_cycle_start_day) await queryInterface.removeColumn('leave_types', 'custom_cycle_start_day');
    await q('DROP TYPE IF EXISTS "enum_leave_types_cycle_type";');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('leave_types', 'cycle_type', {
      type: Sequelize.ENUM('calendar', 'anniversary', 'custom'),
      allowNull: false,
      defaultValue: 'calendar',
    });
    await queryInterface.addColumn('leave_types', 'custom_cycle_start_month', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('leave_types', 'custom_cycle_start_day', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS leave_balances_employee_type_period_unique;');
    await queryInterface.removeColumn('leave_balances', 'carried_forward');
    await queryInterface.removeColumn('leave_balances', 'period_end');
    await queryInterface.removeColumn('leave_balances', 'period_start');
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_employee_id_leave_type_id_year_unique
      ON leave_balances (employee_id, leave_type_id, year)
      WHERE month IS NULL AND deleted_at IS NULL;
    `);
  },
};
