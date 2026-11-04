'use strict';

// Multi-tenant isolation (CLAUDE.md rule 1). Runs fully offline: the real
// Sequelize models build their real SQL, but sequelize.query is swapped for
// a recorder, so nothing ever reaches a database (the .env is prod).
// Run: cd Backend && node --test tests/

const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('./fakeDb');

const { runWithTenant, runAsCompany, getCompanyId, getTenantStore } = require('../src/config/tenant-context');
const {
  resolveCompanyScope,
  requireCompanyScope,
  assertCompanyInCallerGroup,
} = require('../src/utils/resolveCompanyScope');
const brandScope = require('../src/utils/brandScope');

// ── SQL recorder ───────────────────────────────────────────────────────
let sqls = [];
db.sequelize.query = async (sql, opts) => {
  sqls.push(typeof sql === 'string' ? sql : sql.query);
  if (opts && opts.plain) return { count: 0 };
  return [];
};
async function capture(fn) {
  sqls = [];
  await fn();
  return sqls;
}
const whereOf = (sql) => sql.slice(sql.lastIndexOf('WHERE'));

// ── 1. tenant-context (AsyncLocalStorage) ──────────────────────────────
test('tenant context: no store outside a request', () => {
  assert.equal(getCompanyId(), undefined);
});

test('tenant context: runWithTenant survives awaits', async () => {
  await runWithTenant({ companyId: 5, userId: 1 }, async () => {
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(getCompanyId(), 5);
    await Promise.resolve();
    assert.equal(getTenantStore().userId, 1);
  });
  assert.equal(getCompanyId(), undefined);
});

test('tenant context: parallel requests never see each other', async () => {
  const seen = await Promise.all(
    [1, 2, 3, 4].map((id) =>
      runWithTenant({ companyId: id }, async () => {
        await new Promise((r) => setTimeout(r, 10 - id));
        return getCompanyId();
      })
    )
  );
  assert.deepEqual(seen, [1, 2, 3, 4]);
});

test('tenant context: runAsCompany overrides, keeps the rest, restores after', async () => {
  await runWithTenant({ companyId: 5, userId: 9 }, async () => {
    await runAsCompany(8, async () => {
      assert.equal(getCompanyId(), 8);
      assert.equal(getTenantStore().userId, 9);
    });
    await runAsCompany(null, async () => assert.equal(getCompanyId(), null));
    assert.equal(getCompanyId(), 5);
  });
});

// ── 2. tenant-scope hook → real SQL ────────────────────────────────────
test('hook: findAll / findByPk / count are pinned to the tenant', async () => {
  const out = await capture(() =>
    runWithTenant({ companyId: 7 }, async () => {
      await db.Department.findAll({ where: { name: 'x' } });
      await db.Department.findByPk(3);
      await db.Department.count();
      await db.Employee.findOne({ where: { id: 1 } });
    })
  );
  assert.equal(out.length, 4);
  for (const sql of out) assert.match(whereOf(sql), /"company_id" = 7/);
});

test('hook: bulk update / soft-delete are pinned to the tenant', async () => {
  const out = await capture(() =>
    runWithTenant({ companyId: 7 }, async () => {
      await db.Department.update({ name: 'y' }, { where: { id: 1 } });
      await db.Department.destroy({ where: { id: 1 } });
    })
  );
  assert.equal(out.length, 2);
  for (const sql of out) assert.match(sql, /"company_id" = \$\d/);
  assert.match(out[1], /^UPDATE .*"deleted_at"=/, 'destroy is a soft delete (paranoid)');
});

test('hook: Op.or in the caller where is kept and still ANDed with the tenant', async () => {
  const { Op } = db.Sequelize;
  const [sql] = await capture(() =>
    runWithTenant({ companyId: 7 }, () =>
      db.Department.findAll({ where: { [Op.or]: [{ name: 'a' }, { name: 'b' }] } })
    )
  );
  assert.match(whereOf(sql), /"name" = 'a' OR .*"name" = 'b'/);
  assert.match(whereOf(sql), /"company_id" = 7/);
});

test('hook: dormant with no tenant, or tenant null (Super/Group Admin)', async () => {
  const out = await capture(async () => {
    await db.Department.findAll();
    await runWithTenant({ companyId: null }, () => db.Department.findAll());
  });
  for (const sql of out) assert.doesNotMatch(whereOf(sql), /company_id/);
});

test('hook: runAsCompany(other) switches the filter to that company', async () => {
  const [sql] = await capture(() =>
    runWithTenant({ companyId: 7 }, () => runAsCompany(8, () => db.Department.findAll()))
  );
  assert.match(whereOf(sql), /"company_id" = 8/);
});

// ISSUE #1 — an explicit companyId in the caller's where REPLACES the
// tenant filter instead of being ANDed with it (both map to the same
// column, last key wins). So the ORM layer only isolates tenants as long
// as no code path ever passes an untrusted companyId into a where.
test('hook: an explicit other companyId cannot widen past the tenant', { todo: 'ISSUE #1 – explicit companyId overrides the tenant filter' }, async () => {
  const [sql] = await capture(() =>
    runWithTenant({ companyId: 7 }, () => db.Department.findAll({ where: { companyId: 9 } }))
  );
  assert.match(whereOf(sql), /"company_id" = 7/);
});

// ISSUE #2 — these business tables have no company_id column at all, so the
// hook can't touch them: a query on them is only isolated if the service
// remembers to add an Employee include with `where: { companyId }`.
test('hook: leave_requests query under a tenant still has a company filter', { todo: 'ISSUE #2 – 8 business tables have no company_id' }, async () => {
  const [sql] = await capture(() =>
    runWithTenant({ companyId: 7 }, () =>
      db.LeaveRequest.findAll({ include: [{ model: db.Employee, as: 'employee' }] })
    )
  );
  assert.match(sql, /company_id"? = 7/);
});

// ── 3. Model coverage audit ────────────────────────────────────────────
// Tables intentionally without the hook (system-level or group-level, see
// CLAUDE.md): keep this list explicit so a NEW tenant table that forgets
// applyTenantScope fails here.
const UNSCOPED_ALLOWED = new Set([
  'Company', 'Group', 'Plan', 'Permission', 'Role', 'RolePermission', 'KioskLocation',
  'PasswordReset', 'PayrollTemplate', 'PayrollCustomItem', 'PayrollCustomItemEmployee',
  'PayrollReleaseRequest', 'ShiftRoster', 'EmployeeManager', 'LeaveRequestApproval',
  'OdRequestApproval', 'CompOffCreditApproval', 'RosterGroupCompanyPolicy',
  'RosterGroupHoliday', 'RosterGroupLeavePolicy', 'RosterGroupShift',
  // ISSUE #2 — business tables with no company_id column:
  'Attendance', 'AttendanceRegularization', 'CompOffCredit', 'EmployeeDocument',
  'EmployeeShift', 'LeaveBalance', 'LeaveRequest', 'OdRequest',
]);

const modelNames = Object.keys(db).filter((k) => db[k] && db[k].rawAttributes);
const isScoped = (name) => (db[name].options.hooks.beforeFind || []).length > 0;

test('audit: every model with a companyId column is tenant-scoped (or explicitly allowed)', () => {
  const missing = modelNames.filter(
    (name) => db[name].rawAttributes.companyId && !isScoped(name) && !UNSCOPED_ALLOWED.has(name)
  );
  assert.deepEqual(missing, [], `tenant table(s) without applyTenantScope: ${missing.join(', ')}`);
});

test('audit: every tenant-scoped model hooks find, count, bulk update and bulk destroy', () => {
  for (const name of modelNames.filter(isScoped)) {
    const hooks = db[name].options.hooks;
    for (const h of ['beforeFind', 'beforeCount', 'beforeBulkUpdate', 'beforeBulkDestroy']) {
      assert.ok((hooks[h] || []).length > 0, `${name} missing ${h}`);
    }
  }
});

// ISSUE #3 — these roster link tables are not paranoid and are hard-deleted
// (shift/holiday/leavePolicy/companyPolicy services). Listed so any NEW
// non-paranoid model fails here.
const NOT_PARANOID_KNOWN = ['RosterGroupCompanyPolicy', 'RosterGroupHoliday', 'RosterGroupLeavePolicy', 'RosterGroupShift'];
test('audit: every model is paranoid (soft delete, rule 2)', () => {
  const hard = modelNames.filter((name) => !db[name].options.paranoid && !NOT_PARANOID_KNOWN.includes(name));
  assert.deepEqual(hard, [], `models without paranoid: ${hard.join(', ')}`);
});

test('audit: list of business tables with no company_id (ISSUE #2)', () => {
  const noCompany = modelNames.filter(
    (n) => !db[n].rawAttributes.companyId && db[n].rawAttributes.employeeId
  );
  // Fails if the list grows — a new per-employee table should carry company_id.
  const known = ['Attendance', 'AttendanceRegularization', 'CompOffCredit', 'EmployeeDocument',
    'EmployeeShift', 'LeaveBalance', 'LeaveRequest', 'OdRequest'];
  const unexpected = noCompany.filter((n) => !known.includes(n) && !UNSCOPED_ALLOWED.has(n));
  assert.deepEqual(unexpected, []);
});

// ── 4. resolveCompanyScope ─────────────────────────────────────────────
test('resolveCompanyScope: a company caller can never override', () => {
  assert.equal(resolveCompanyScope({ authCompanyId: 1, override: 2 }), 1);
  assert.equal(resolveCompanyScope({ authCompanyId: 1, override: undefined }), 1);
});

test('resolveCompanyScope: company-less caller uses the override, else null', () => {
  assert.equal(resolveCompanyScope({ authCompanyId: null, override: '4' }), '4');
  assert.equal(resolveCompanyScope({ authCompanyId: null, override: '' }), null);
  assert.equal(resolveCompanyScope({ authCompanyId: undefined }), null);
});

test('requireCompanyScope: 400 when nothing resolves', () => {
  assert.throws(() => requireCompanyScope({ authCompanyId: null }), (e) => e.status === 400);
  assert.equal(requireCompanyScope({ authCompanyId: null, override: 3 }), 3);
});

test('assertCompanyInCallerGroup: Group Admin limited to own Group', async () => {
  const companies = [{ id: 1, groupId: 10 }, { id: 2, groupId: 20 }];
  const orig = db.Company.findOne;
  db.Company.findOne = async ({ where }) =>
    companies.find((c) => String(c.id) === String(where.id) && String(c.groupId) === String(where.groupId)) || null;
  try {
    await assertCompanyInCallerGroup({ groupId: 10, companyId: 1 });
    await assert.rejects(assertCompanyInCallerGroup({ groupId: 10, companyId: 2 }), (e) => e.status === 403);
    await assert.rejects(assertCompanyInCallerGroup({ groupId: 10, companyId: null }), (e) => e.status === 400);
    await assertCompanyInCallerGroup({ groupId: null, companyId: 2 }); // no-op for non Group Admin
  } finally {
    db.Company.findOne = orig;
  }
});

// ── 5. brandScope helpers (Brand isolation inside a company) ───────────
test('brandScope: create — omitted brandId never falls through to company-wide for a Brand caller', () => {
  assert.equal(brandScope.resolveCreateBrandId({ brandId: null, scopedBrandIds: [4] }), 4);
  assert.equal(brandScope.resolveCreateBrandId({ brandId: null, scopedBrandIds: null }), null);
  assert.equal(brandScope.resolveCreateBrandId({ brandId: 6, scopedBrandIds: null }), 6);
});

test('brandScope: list — Brand caller sees only own brands, never shared rows', () => {
  const { Op } = db.Sequelize;
  assert.deepEqual(brandScope.applyBrandListScope({}, { scopedBrandIds: [4, 5] }), { brandId: { [Op.in]: [4, 5] } });
  assert.deepEqual(brandScope.applyBrandListScope({}, { scopedBrandIds: null }), {});
  assert.deepEqual(brandScope.applyBrandListScope({}, { brandId: 4, scopedBrandIds: [4] }), { brandId: 4 });
});

test('brandScope: write — other brand or shared row is 403 for a Brand caller', () => {
  assert.doesNotThrow(() => brandScope.assertBrandWriteScope({ scopedBrandIds: [4], recordBrandId: 4 }));
  assert.throws(() => brandScope.assertBrandWriteScope({ scopedBrandIds: [4], recordBrandId: 5 }), (e) => e.status === 403);
  assert.throws(() => brandScope.assertBrandWriteScope({ scopedBrandIds: [4], recordBrandId: null }), (e) => e.status === 403);
  assert.doesNotThrow(() => brandScope.assertBrandWriteScope({ scopedBrandIds: null, recordBrandId: 5 }));
  assert.throws(() => brandScope.assertBrandReassignAllowed({ scopedBrandIds: [4], brandIdProvided: true }), (e) => e.status === 403);
  assert.doesNotThrow(() => brandScope.assertBrandReassignAllowed({ scopedBrandIds: null, brandIdProvided: true }));
});

test('brandScope: brand must belong to the company', async () => {
  const orig = db.Brand.findOne;
  db.Brand.findOne = async ({ where }) => (String(where.id) === '4' && String(where.companyId) === '1' ? { id: 4 } : null);
  try {
    await brandScope.assertBrandBelongsToCompany({ brandId: 4, companyId: 1 });
    await assert.rejects(brandScope.assertBrandBelongsToCompany({ brandId: 4, companyId: 2 }), (e) => e.status === 400);
    await brandScope.assertBrandBelongsToCompany({ brandId: null, companyId: 2 });
  } finally {
    db.Brand.findOne = orig;
  }
});
