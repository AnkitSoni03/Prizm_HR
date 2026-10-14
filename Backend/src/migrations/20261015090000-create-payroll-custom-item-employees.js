'use strict';

// Extra allowances / deductions / employer contributions (payroll_custom_items)
// now apply to the employees chosen on the item itself — not through salary
// templates (rules.customItems) or per-salary switches (disabled_items).
//
// Existing data is carried over so nobody's salary changes:
//   1. every employee with an active salary gets each item their template had
//      on and their salary didn't switch off;
//   2. custom_* keys are removed from salary_assignments.disabled_items;
//   3. each generated month's rules_snapshot.customItems is narrowed to that
//      employee's items (itemsPerEmployee: true), so a later recalculation
//      gives the same result.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payroll_custom_item_employees', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'groups', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      custom_item_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'payroll_custom_items', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      employee_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_by_user_id: { type: Sequelize.BIGINT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('payroll_custom_item_employees', ['employee_id']);
    await queryInterface.addIndex('payroll_custom_item_employees', ['group_id']);
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX payroll_custom_item_employees_one_live ON payroll_custom_item_employees (custom_item_id, employee_id) WHERE deleted_at IS NULL;'
    );

    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });

    // 1. Seed who gets which item, from the current templates + salaries.
    const items = await q('SELECT id, group_id FROM payroll_custom_items WHERE deleted_at IS NULL');
    const assignments = await q(
      `SELECT sa.id, sa.employee_id, sa.group_id, sa.disabled_items, t.rules
         FROM salary_assignments sa
         JOIN payroll_templates t ON t.id = sa.template_id
        WHERE sa.deleted_at IS NULL AND sa.status = 'active'`
    );
    const now = new Date();
    const rows = [];
    const members = new Map(); // employeeId -> Set(itemId)
    for (const a of assignments) {
      const cfgs = (a.rules && a.rules.customItems) || {};
      const off = new Set(Array.isArray(a.disabled_items) ? a.disabled_items : []);
      for (const item of items) {
        if (String(item.group_id) !== String(a.group_id)) continue;
        const cfg = cfgs[String(item.id)] || {};
        if (cfg.enabled === false || off.has(`custom_${item.id}`)) continue;
        rows.push({
          group_id: a.group_id,
          custom_item_id: item.id,
          employee_id: a.employee_id,
          created_at: now,
          updated_at: now,
        });
        if (!members.has(String(a.employee_id))) members.set(String(a.employee_id), new Set());
        members.get(String(a.employee_id)).add(String(item.id));
      }
    }
    for (let i = 0; i < rows.length; i += 1000) {
      await queryInterface.bulkInsert('payroll_custom_item_employees', rows.slice(i, i + 1000));
    }

    // 2. Per-salary switches for custom items are gone.
    for (const a of assignments) {
      const list = Array.isArray(a.disabled_items) ? a.disabled_items : [];
      const kept = list.filter((k) => !String(k).startsWith('custom_'));
      if (kept.length !== list.length) {
        await queryInterface.sequelize.query('UPDATE salary_assignments SET disabled_items = :list::jsonb WHERE id = :id', {
          replacements: { list: JSON.stringify(kept), id: a.id },
        });
      }
    }

    // 3. Narrow each generated month's snapshot to that employee's items.
    const payrolls = await q('SELECT id, employee_id, rules_snapshot FROM employee_payrolls WHERE deleted_at IS NULL');
    for (const p of payrolls) {
      const snap = p.rules_snapshot;
      if (!snap || snap.itemsPerEmployee) continue;
      const mine = members.get(String(p.employee_id)) || new Set();
      const next = {
        ...snap,
        customItems: (snap.customItems || []).filter((i) => mine.has(String(i.id))),
        itemsPerEmployee: true,
      };
      await queryInterface.sequelize.query('UPDATE employee_payrolls SET rules_snapshot = :snap::jsonb WHERE id = :id', {
        replacements: { snap: JSON.stringify(next), id: p.id },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payroll_custom_item_employees');
  },
};
