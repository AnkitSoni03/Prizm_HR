'use strict';

// "No Brand" (company-level) employees in a Brand-mode company — see the
// 2026-11-19 CLAUDE.md entry. In-memory models only (fakeDb points the DB
// config at a dead address), so nothing here reaches a real database.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Op } = require('sequelize');
const { db, reset, matches } = require('./fakeDb');
const service = require('../src/modules/org/employee.service');
const controller = require('../src/modules/org/employee.controller');
const { notifyApprovers } = require('../src/utils/notifications');

const BRAND_MODE = 1;
const DIRECT_MODE = 2;

function setup() {
  const t = reset();
  t.Company.insert({ id: BRAND_MODE, name: 'XYZ', usesBrands: true });
  t.Company.insert({ id: DIRECT_MODE, name: 'Direct Co', usesBrands: false });
  const brands = [{ id: 11, companyId: BRAND_MODE, name: 'A' }];
  const departments = [
    { id: 21, companyId: BRAND_MODE, brandId: null, name: 'Shared Ops' },
    { id: 22, companyId: BRAND_MODE, brandId: 11, name: 'Brand A Sales' },
  ];
  db.Brand.findOne = async ({ where }) => brands.find((b) => matches(b, where)) || null;
  db.Department.findOne = async ({ where }) => departments.find((d) => matches(d, where)) || null;
  return t;
}

async function expectHttpError(promise, status, pattern) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status ?? err.statusCode, status);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

test('createEmployee — Brand-mode company', async (t) => {
  await t.test('explicit null brandId ("No Brand") creates a company-level employee', async () => {
    const tables = setup();
    const emp = await service.createEmployee({ companyId: BRAND_MODE, name: 'Ravi', brandId: null });
    assert.equal(emp.brandId, null);
    assert.equal(tables.Employee.rows.length, 1);
  });

  await t.test('missing brandId is still rejected (no accidental company level)', async () => {
    const tables = setup();
    await expectHttpError(service.createEmployee({ companyId: BRAND_MODE, name: 'Ravi' }), 400, /brandId is required/);
    await expectHttpError(service.createEmployee({ companyId: BRAND_MODE, name: 'Ravi', brandId: '' }), 400, /brandId is required/);
    assert.equal(tables.Employee.rows.length, 0);
  });

  await t.test('a real brand still works as before', async () => {
    setup();
    const emp = await service.createEmployee({ companyId: BRAND_MODE, name: 'Asha', brandId: 11, departmentId: 22 });
    assert.equal(emp.brandId, 11);
  });

  await t.test('"No Brand" employee may use a shared department', async () => {
    setup();
    const emp = await service.createEmployee({ companyId: BRAND_MODE, name: 'Ravi', brandId: null, departmentId: 21 });
    assert.equal(emp.departmentId, 21);
  });

  await t.test("\"No Brand\" employee can't use a Brand's own department", async () => {
    setup();
    await expectHttpError(
      service.createEmployee({ companyId: BRAND_MODE, name: 'Ravi', brandId: null, departmentId: 22 }),
      400,
      /different Brand/
    );
  });
});

test('createEmployee — direct-mode company is unchanged', async (t) => {
  await t.test('no brandId → created', async () => {
    setup();
    const emp = await service.createEmployee({ companyId: DIRECT_MODE, name: 'D1' });
    assert.equal(emp.brandId, null);
  });
  await t.test('null brandId → created', async () => {
    setup();
    const emp = await service.createEmployee({ companyId: DIRECT_MODE, name: 'D2', brandId: null });
    assert.equal(emp.brandId, null);
  });
  await t.test('a brandId → still rejected', async () => {
    setup();
    await expectHttpError(service.createEmployee({ companyId: DIRECT_MODE, name: 'D3', brandId: 11 }), 400, /does not use Brands/);
  });
});

function fakeRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

async function callCreate(body, auth = {}) {
  const res = fakeRes();
  let error;
  await controller.create({ body, auth: { companyId: BRAND_MODE, scopedBrandIds: null, ...auth } }, res, (err) => {
    error = err;
  });
  return { res, error };
}

test('POST /employees controller', async (t) => {
  await t.test('body { brandId: null } reaches the service as "No Brand" → 201', async () => {
    setup();
    const { res, error } = await callCreate({ name: 'Ravi', brandId: null });
    assert.equal(error, undefined);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.brandId, null);
  });

  await t.test('body without brandId → 400', async () => {
    setup();
    const { error } = await callCreate({ name: 'Ravi' });
    assert.equal(error?.status ?? error?.statusCode, 400);
  });

  await t.test('Brand Admin (brand-scoped) sending "No Brand" → 400, nothing created', async () => {
    const tables = setup();
    const { res } = await callCreate({ name: 'Ravi', brandId: null }, { scopedBrandIds: [11] });
    assert.equal(res.statusCode, 400);
    assert.equal(tables.Employee.rows.length, 0);
  });
});

test('transferEmployee', async (t) => {
  await t.test('Company Admin moves a Brand employee to "No Brand"', async () => {
    const tables = setup();
    tables.Employee.insert({ id: 5, companyId: BRAND_MODE, brandId: 11, departmentId: 22 });
    const emp = await service.transferEmployee({ companyId: BRAND_MODE, id: 5, brandId: null, departmentId: 21 });
    assert.equal(emp.brandId, null);
    assert.equal(emp.departmentId, 21);
  });

  await t.test('Brand Admin cannot move an employee to "No Brand"', async () => {
    const tables = setup();
    tables.Employee.insert({ id: 5, companyId: BRAND_MODE, brandId: 11 });
    await expectHttpError(
      service.transferEmployee({ companyId: BRAND_MODE, id: 5, brandId: null, scopedBrandIds: [11] }),
      403
    );
    assert.equal(tables.Employee.rows[0].brandId, 11);
  });
});

test('listEmployees brand filter', async (t) => {
  let lastWhere;
  const run = async (args) => {
    setup();
    db.Employee.findAndCountAll = async ({ where }) => {
      lastWhere = where;
      return { rows: [], count: 0 };
    };
    await service.listEmployees({ limit: 10, offset: 0, companyId: BRAND_MODE, ...args });
    return lastWhere;
  };

  await t.test("brandId='none' → company-level employees only (brand_id IS NULL)", async () => {
    const where = await run({ brandId: 'none' });
    assert.ok('brandId' in where);
    assert.equal(where.brandId, null);
  });
  await t.test('a real brandId filters to that brand (unchanged)', async () => {
    assert.equal((await run({ brandId: 11 })).brandId, 11);
  });
  await t.test('no brandId → no brand filter (unchanged)', async () => {
    assert.ok(!('brandId' in (await run({}))));
  });
  await t.test('Brand Admin without a filter stays confined to their brands', async () => {
    assert.deepEqual((await run({ scopedBrandIds: [11] })).brandId, [11]);
  });
});

test('notifyApprovers brand scope', async (t) => {
  const grants = [
    { userId: 100, companyId: BRAND_MODE, brandId: null }, // Company Admin / HR (brand-wide)
    { userId: 200, companyId: BRAND_MODE, brandId: 11 }, // Brand Admin of A
    { userId: 300, companyId: BRAND_MODE, brandId: 12 }, // Brand Admin of B
  ];
  const recipientsFor = async (brandId) => {
    const created = [];
    db.UserRole.findAll = async ({ where }) => grants.filter((g) => matches(g, where));
    db.Company.findByPk = async () => ({ id: BRAND_MODE, groupId: null });
    db.Notification.create = async (row) => {
      created.push(row.userId);
      return { toJSON: () => row };
    };
    await notifyApprovers({ companyId: BRAND_MODE, brandId, code: 'leave_request:approve', type: 'request_pending', title: 't' });
    return created.sort();
  };

  await t.test('"No Brand" employee (brandId null) → brand-wide approvers only', async () => {
    assert.deepEqual(await recipientsFor(null), [100]);
  });
  await t.test('Brand employee → brand-wide + that brand only (unchanged)', async () => {
    assert.deepEqual(await recipientsFor(11), [100, 200]);
  });
  await t.test('brandId undefined → no brand filter (unchanged)', async () => {
    assert.deepEqual(await recipientsFor(undefined), [100, 200, 300]);
  });
});

test('frontend noBrand helpers', async (t) => {
  const fe = await import(pathToFileURL(path.join(__dirname, '../../Frontend/src/utils/noBrand.ts')).href);
  const user = (roles, companyUsesBrands = true) => ({ roles, companyUsesBrands });

  await t.test('Company Admin (company-wide role) gets "No Brand"', () => {
    assert.equal(fe.canUseNoBrand(user([{ name: 'Company Admin', brandId: null }])), true);
  });
  await t.test('Brand Admin does not', () => {
    assert.equal(fe.canUseNoBrand(user([{ name: 'Brand Admin', brandId: '11' }])), false);
  });
  await t.test('Employee with a Brand-level power does not', () => {
    assert.equal(
      fe.canUseNoBrand(user([{ name: 'Employee', brandId: null }, { name: 'Custom Powers – 5 (brand)', brandId: '11' }])),
      false
    );
  });
  await t.test('direct-mode company never shows it', () => {
    assert.equal(fe.canUseNoBrand(user([{ name: 'Company Admin', brandId: null }], false)), false);
  });
  await t.test('signed out → false', () => assert.equal(fe.canUseNoBrand(null), false));
  await t.test('toApiBrandId maps "none" → null, keeps real ids', () => {
    assert.equal(fe.toApiBrandId('none'), null);
    assert.equal(fe.toApiBrandId('11'), '11');
  });
});

// Keep Op referenced for readers comparing with other suites' matchers.
void Op;
