'use strict';

// Group-level powers limited to chosen companies
// (employee.service.js::assignEmployeePowers + utils/customPowerSync.js).
// In-memory models only — never touches a real DB (fakeDb points the config
// at a dead address).

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { db } = require('./fakeDb');
const { assignEmployeePowers } = require('../src/modules/org/employee.service');

function likeToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchValue(val, cond) {
  if (cond === null) return val === null || val === undefined;
  if (typeof cond === 'object' && !Array.isArray(cond)) {
    return Reflect.ownKeys(cond).every((op) => {
      const c = cond[op];
      if (op === Op.in) return c.map(String).includes(String(val));
      if (op === Op.ne) return c === null ? val != null : String(val) !== String(c);
      if (op === Op.like) return likeToRegex(c).test(String(val));
      throw new Error(`unsupported op ${String(op)}`);
    });
  }
  return String(val) === String(cond);
}

function rowMatches(row, where = {}) {
  return Reflect.ownKeys(where).every((key) => {
    if (key === Op.or) return where[key].some((w) => rowMatches(row, w));
    if (key === Op.and) return where[key].every((w) => rowMatches(row, w));
    return matchValue(row[key], where[key]);
  });
}

function table() {
  const t = { rows: [], nextId: 1 };
  const wrap = (values) => {
    const row = { ...values };
    row.update = async (v) => Object.assign(row, v);
    row.destroy = async () => {
      t.rows = t.rows.filter((r) => r !== row);
    };
    return row;
  };
  t.insert = (values) => {
    const row = wrap({ id: t.nextId++, ...values });
    t.rows.push(row);
    return row;
  };
  t.model = {
    findByPk: async (id) => t.rows.find((r) => String(r.id) === String(id)) || null,
    findOne: async ({ where } = {}) => t.rows.find((r) => rowMatches(r, where)) || null,
    findAll: async ({ where } = {}) => t.rows.filter((r) => rowMatches(r, where)),
    create: async (values) => t.insert(values),
    bulkCreate: async (list) => list.map((v) => t.insert(v)),
    findOrCreate: async ({ where, defaults }) => {
      const hit = t.rows.find((r) => rowMatches(r, where));
      return hit ? [hit, false] : [t.insert({ ...where, ...defaults }), true];
    },
    destroy: async ({ where } = {}) => {
      const before = t.rows.length;
      t.rows = t.rows.filter((r) => !rowMatches(r, where));
      return before - t.rows.length;
    },
  };
  return t;
}

const CODES = ['holiday:create', 'holiday:update', 'holiday:delete', 'employee:read', 'payroll:manage', 'leave_request:approve'];

function world() {
  const t = {
    Company: table(),
    Employee: table(),
    Role: table(),
    RolePermission: table(),
    UserRole: table(),
    Permission: table(),
    Brand: table(),
  };
  for (const name of Object.keys(t)) Object.assign(db[name], t[name].model);
  // getEmployeeForRead at the end of assignEmployeePowers (includes ignored).
  db.Employee.findOne = async ({ where }) => t.Employee.rows.find((r) => String(r.id) === String(where.id)) || null;
  // The read-back's shift lookups — nothing assigned.
  db.ShiftRoster.findOne = async () => null;
  db.EmployeeShift.findOne = async () => null;
  CODES.forEach((code) => t.Permission.insert({ code }));
  // Group 10: companies 1..5. Group 20: company 6.
  for (let id = 1; id <= 5; id += 1) t.Company.insert({ id, groupId: 10, status: 'active' });
  t.Company.insert({ id: 6, groupId: 20, status: 'active' });
  // Company 1: brands 1..3. Company 2: brand 4.
  t.Brand.insert({ companyId: 1 });
  t.Brand.insert({ companyId: 1 });
  t.Brand.insert({ companyId: 1 });
  t.Brand.insert({ companyId: 2 });
  t.Employee.insert({ id: 100, companyId: 1, brandId: null, userId: 500, customRoleId: null, customPowerLevels: null, customPowerCompanies: null, customPowerBrands: null, managerId: 999, photoUrl: null });
  return t;
}

const groupAdmin = { userId: 1, companyId: null, groupId: 10 };
const companyAdmin = { userId: 2, companyId: 1, groupId: null };
const save = (auth, powers) =>
  assignEmployeePowers({ companyId: auth.companyId, groupId: auth.groupId, id: 100, powers, auth });

const grantsOf = (t) =>
  t.UserRole.rows.map((g) => ({
    brandId: g.brandId,
    role: t.Role.rows.find((r) => r.id === g.roleId).name,
    groupId: g.groupId,
    allowed: g.allowedCompanyIds,
    codes: t.RolePermission.rows
      .filter((rp) => rp.roleId === g.roleId)
      .map((rp) => t.Permission.rows.find((p) => p.id === rp.permissionId).code)
      .sort(),
  }));

test('Group level with chosen companies → own Role, grant carries the list', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: ['3', 1, '2', '3'] }]);
  const emp = t.Employee.rows[0];
  assert.deepEqual(emp.customPowerLevels, { roster: 'group' });
  assert.deepEqual(emp.customPowerCompanies, { roster: [1, 2, 3] });
  const grants = grantsOf(t);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].role, 'Custom Powers – 100 (group:roster)');
  assert.equal(String(grants[0].groupId), '10');
  assert.deepEqual(grants[0].allowed, [1, 2, 3]);
  assert.ok(grants[0].codes.includes('holiday:create'));
});

test('All companies (null) and limited powers live side by side', async () => {
  const t = world();
  await save(groupAdmin, [
    { key: 'roster', level: 'group', companyIds: [1, 2, 3] },
    { key: 'approve_requests', level: 'group', companyIds: null },
  ]);
  const grants = grantsOf(t);
  const shared = grants.find((g) => g.role === 'Custom Powers – 100 (group)');
  const limited = grants.find((g) => g.role === 'Custom Powers – 100 (group:roster)');
  assert.equal(shared.allowed, null);
  assert.ok(shared.codes.includes('leave_request:approve'));
  assert.ok(!shared.codes.includes('holiday:create'), 'limited power stays out of the shared Role');
  assert.deepEqual(limited.allowed, [1, 2, 3]);
  assert.deepEqual(t.Employee.rows[0].customPowerCompanies, { roster: [1, 2, 3] });
});

test('switching back to All companies removes the limited Role and its grant', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [1, 2] }]);
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: null }]);
  const grants = grantsOf(t);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].role, 'Custom Powers – 100 (group)');
  assert.equal(grants[0].allowed, null);
  assert.equal(t.Role.rows.filter((r) => r.name.includes('(group:')).length, 0);
  assert.equal(t.Employee.rows[0].customPowerCompanies, null);
});

test('changing the list updates the grant in place', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [1, 2] }]);
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [4, 5] }]);
  const grants = grantsOf(t);
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0].allowed, [4, 5]);
});

test('omitted companyIds keep the current list (a screen without the picker)', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [1, 2] }]);
  await save(groupAdmin, [{ key: 'roster', level: 'group' }]);
  assert.deepEqual(grantsOf(t)[0].allowed, [1, 2]);
});

test('a Company Admin saving other powers leaves the Group-level list untouched', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [1, 2] }]);
  // Company Admin holds nothing → can't add anything, but re-saving the same
  // group power (no companyIds sent) is not a change and must pass.
  await save(companyAdmin, [{ key: 'roster', level: 'group' }]);
  assert.deepEqual(grantsOf(t)[0].allowed, [1, 2]);
  await assert.rejects(
    save(companyAdmin, [{ key: 'roster', level: 'group', companyIds: [1] }]),
    (err) => err.status === 403
  );
});

test('rejections: empty list, company of another Group, non-group level, payroll', async () => {
  world();
  const status = (p) => p.then(() => 'ok', (err) => err.status);
  assert.equal(await status(save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [] }])), 400);
  assert.equal(await status(save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [1, 6] }])), 400);
  assert.equal(await status(save(groupAdmin, [{ key: 'roster', level: 'company', companyIds: [1] }])), 400);
  assert.equal(await status(save(groupAdmin, [{ key: 'run_payroll', level: 'group', companyIds: [1] }])), 400);
  assert.equal(await status(save(groupAdmin, [{ key: 'run_payroll', level: 'group', companyIds: null }])), 'ok');
});

test('removing the power drops the limited Role', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [1, 2] }]);
  await save(groupAdmin, []);
  assert.equal(t.UserRole.rows.length, 0);
  assert.equal(t.Role.rows.filter((r) => r.name.includes('(group')).length, 0);
});

// ── Company level → chosen brands ─────────────────────────────────────
test('Company level with chosen brands → one brand-scoped grant per brand', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'company', brandIds: ['3', 1, 1] }]);
  assert.deepEqual(t.Employee.rows[0].customPowerBrands, { roster: [1, 3] });
  const grants = grantsOf(t);
  assert.equal(grants.length, 2);
  assert.ok(grants.every((g) => g.role === 'Custom Powers – 100 (brands:roster)' && g.groupId === null));
  assert.deepEqual(grants.map((g) => String(g.brandId)).sort(), ['1', '3']);
  assert.ok(grants[0].codes.includes('holiday:create'));
});

test('changing / omitting / clearing the brand list', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'company', brandIds: [1, 2] }]);
  await save(groupAdmin, [{ key: 'roster', level: 'company', brandIds: [2, 3] }]);
  assert.deepEqual(grantsOf(t).map((g) => String(g.brandId)).sort(), ['2', '3']);

  await save(groupAdmin, [{ key: 'roster', level: 'company' }]); // picker not shown → keep
  assert.deepEqual(grantsOf(t).map((g) => String(g.brandId)).sort(), ['2', '3']);

  await save(groupAdmin, [{ key: 'roster', level: 'company', brandIds: null }]); // all brands
  const grants = grantsOf(t);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].role, 'Custom Powers – 100');
  assert.equal(grants[0].brandId, null);
  assert.ok(grants[0].codes.includes('holiday:create'));
  assert.equal(t.Role.rows.filter((r) => r.name.includes('(brands:')).length, 0);
  assert.equal(t.Employee.rows[0].customPowerBrands, null);
});

test('brand rejections: empty, other company, wrong level', async () => {
  world();
  const status = (p) => p.then(() => 'ok', (err) => err.status);
  assert.equal(await status(save(groupAdmin, [{ key: 'roster', level: 'company', brandIds: [] }])), 400);
  assert.equal(await status(save(groupAdmin, [{ key: 'roster', level: 'company', brandIds: [1, 4] }])), 400);
  assert.equal(await status(save(groupAdmin, [{ key: 'roster', level: 'group', brandIds: [1] }])), 400);
  assert.equal(await status(save(groupAdmin, [{ key: 'roster', level: 'brand', brandIds: [1] }])), 400);
});

test('moving from chosen brands to Group level drops the brand grants', async () => {
  const t = world();
  await save(groupAdmin, [{ key: 'roster', level: 'company', brandIds: [1, 2] }]);
  await save(groupAdmin, [{ key: 'roster', level: 'group', companyIds: [1, 2] }]);
  const grants = grantsOf(t);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].role, 'Custom Powers – 100 (group:roster)');
  assert.equal(t.Employee.rows[0].customPowerBrands, null);
});
