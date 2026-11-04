'use strict';

// RBAC + auth pipeline (CLAUDE.md rules 3, 4). Runs fully offline against
// tests/fakeDb.js plus an in-memory UserRole→Role→Permission grant table.
// Run: cd Backend && node --test tests/

process.env.JWT_SECRET = 'test-secret-only';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { db, reset, matches } = require('./fakeDb');
const { getCompanyId, getTenantStore, runWithTenant } = require('../src/config/tenant-context');
const { requirePermission, userHasPermission, getBrandScope, grantWhere } = require('../src/middleware/rbac.middleware');
const { requireAuth, requireSuperAdmin } = require('../src/middleware/auth.middleware');
const { checkGrantAuthority, callerKind } = require('../src/utils/powerAuthority');
const { requireApprovalDecisionAccess, resolveHistoryAccess } = require('../src/middleware/approvalAccess');

// ── In-memory grants ───────────────────────────────────────────────────
// Each grant = one user_roles row with the codes its role holds.
let grants = [];
let tenantSeenByGrantQuery = [];
function grantQuery(where, include) {
  tenantSeenByGrantQuery.push(getCompanyId());
  const code = include?.[0]?.include?.[0]?.where?.code;
  return grants.filter((g) => matches(g, where) && (!code || g.codes.includes(code)));
}
db.UserRole.findOne = async ({ where, include } = {}) => grantQuery(where, include)[0] || null;
db.UserRole.findAll = async ({ where, include } = {}) => grantQuery(where, include);

const grant = (userId, codes, { companyId = 1, groupId = null, brandId = null } = {}) =>
  grants.push({ userId, companyId, groupId, brandId, codes });

function freshWorld() {
  grants = [];
  tenantSeenByGrantQuery = [];
  const t = reset();
  // Group 10: companies 1, 2.  Group 20: company 3.
  t.Company.insert({ id: 1, groupId: 10, status: 'active' });
  t.Company.insert({ id: 2, groupId: 10, status: 'active' });
  t.Company.insert({ id: 3, groupId: 20, status: 'active' });
  return t;
}

// ── Express-ish req/res ────────────────────────────────────────────────
function call(mw, { auth, headers = {}, params = {}, query = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      auth,
      headers,
      params,
      query,
      body,
      get: (h) => headers[h] ?? headers[h.toLowerCase()],
    };
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b, req }); return this; },
    };
    Promise.resolve(
      mw(req, res, (err) => {
        if (err) return resolve({ status: err.status || 500, error: err, req });
        resolve({ status: 'next', req, tenant: getCompanyId(), store: getTenantStore() });
      })
    ).catch(reject);
  });
}

// ── 1. grantWhere / userHasPermission / getBrandScope ──────────────────
test('grantWhere: own company normally; only group-level home grants while acting', () => {
  assert.deepEqual(grantWhere({ userId: 1, companyId: 2 }), { userId: 1, companyId: 2 });
  const acting = grantWhere({ userId: 1, companyId: 2, homeCompanyId: 1 });
  assert.equal(acting.companyId, 1);
  assert.ok(acting.groupId, 'requires group_id set');
});

test('userHasPermission: grant in another company never counts', async () => {
  freshWorld();
  grant(1, ['employee:read'], { companyId: 2 });
  assert.equal(await userHasPermission({ userId: 1, companyId: 1 }, 'employee:read'), false);
  assert.equal(await userHasPermission({ userId: 1, companyId: 2 }, 'employee:read'), true);
  assert.equal(await userHasPermission({ userId: 1, companyId: 2 }, 'employee:delete'), false);
});

test('userHasPermission: brand-specific grant only reaches its own brand', async () => {
  freshWorld();
  grant(1, ['leave_request:read'], { brandId: 4 });
  const auth = { userId: 1, companyId: 1 };
  assert.equal(await userHasPermission(auth, 'leave_request:read', 4), true);
  assert.equal(await userHasPermission(auth, 'leave_request:read', 5), false);
  grant(2, ['leave_request:read']); // brand-wide
  assert.equal(await userHasPermission({ userId: 2, companyId: 1 }, 'leave_request:read', 5), true);
});

test('getBrandScope: none / company-wide / brand list', async () => {
  freshWorld();
  grant(1, ['shift:read'], { brandId: 4 });
  grant(1, ['shift:read'], { brandId: 5 });
  grant(2, ['shift:read'], { brandId: 4 });
  grant(2, ['shift:read']);
  assert.deepEqual(await getBrandScope({ userId: 1, companyId: 1 }, 'shift:read'), { allowed: true, companyWide: false, brandIds: [4, 5] });
  assert.equal((await getBrandScope({ userId: 2, companyId: 1 }, 'shift:read')).companyWide, true);
  assert.equal((await getBrandScope({ userId: 3, companyId: 1 }, 'shift:read')).allowed, false);
});

test('acting in a sibling company: only group-level grants count, tenant hook off for the lookup', async () => {
  freshWorld();
  grant(1, ['employee:read', 'employee:delete'], { companyId: 1 }); // ordinary own-company role
  grant(1, ['employee:read'], { companyId: 1, groupId: 10 }); // group-level power
  const auth = { userId: 1, companyId: 2, homeCompanyId: 1 };
  await runWithTenant({ companyId: 2 }, async () => {
    assert.equal(await userHasPermission(auth, 'employee:read'), true);
    assert.equal(await userHasPermission(auth, 'employee:delete'), false, 'own-company role must not reach a sibling company');
  });
  assert.ok(tenantSeenByGrantQuery.every((c) => c === null), 'grant lookups ran with the hook off');
});

// ── 2. requirePermission middleware ────────────────────────────────────
test('requirePermission: 401 / 403 / pass', async () => {
  freshWorld();
  grant(1, ['employee:read']);
  const mw = requirePermission('employee:read');
  assert.equal((await call(mw, {})).status, 401);
  assert.equal((await call(mw, { auth: { userId: 9, companyId: 1 } })).status, 403);
  const ok = await call(mw, { auth: { userId: 1, companyId: 1 } });
  assert.equal(ok.status, 'next');
  assert.equal(ok.req.auth.scopedBrandIds, null);
});

test('requirePermission: brand caller gets scopedBrandIds; another brand in params/query/body is 403', async () => {
  freshWorld();
  grant(1, ['employee:read'], { brandId: 4 });
  const mw = requirePermission('employee:read');
  const auth = () => ({ userId: 1, companyId: 1 });
  const ok = await call(mw, { auth: auth() });
  assert.deepEqual(ok.req.auth.scopedBrandIds, [4]);
  assert.equal((await call(mw, { auth: auth(), query: { brandId: '4' } })).status, 'next');
  assert.equal((await call(mw, { auth: auth(), query: { brandId: '5' } })).status, 403);
  assert.equal((await call(mw, { auth: auth(), body: { brandId: 5 } })).status, 403);
  assert.equal((await call(mw, { auth: auth(), params: { brandId: '5' } })).status, 403);
});

test('requirePermission: Group Admin (company NULL) grant matches NULL, not a company', async () => {
  freshWorld();
  grant(7, ['company:read'], { companyId: null, groupId: 10 });
  const mw = requirePermission('company:read');
  assert.equal((await call(mw, { auth: { userId: 7, companyId: null, groupId: 10 } })).status, 'next');
  assert.equal((await call(mw, { auth: { userId: 7, companyId: 1, groupId: null } })).status, 403);
});

// ── 3. requireSuperAdmin ───────────────────────────────────────────────
test('requireSuperAdmin: only company NULL AND group NULL', async () => {
  assert.equal((await call(requireSuperAdmin, {})).status, 401);
  assert.equal((await call(requireSuperAdmin, { auth: { companyId: null, groupId: null } })).status, 'next');
  assert.equal((await call(requireSuperAdmin, { auth: { companyId: null, groupId: 10 } })).status, 403);
  assert.equal((await call(requireSuperAdmin, { auth: { companyId: 1, groupId: null } })).status, 403);
});

// ── 4. requireAuth (JWT → tenant context, deactivation, acting) ───────
const token = (p) => jwt.sign({ sub: p.userId, companyId: p.companyId ?? null, groupId: p.groupId ?? null, employeeId: p.employeeId ?? null }, process.env.JWT_SECRET);
const bearer = (p) => ({ authorization: `Bearer ${token(p)}` });
let users = {};
db.User.findByPk = async (id) => users[id] || null;

test('requireAuth: missing / bad / foreign-secret token → 401', async () => {
  freshWorld();
  assert.equal((await call(requireAuth, { headers: {} })).status, 401);
  assert.equal((await call(requireAuth, { headers: { authorization: 'Bearer nope' } })).status, 401);
  const forged = jwt.sign({ sub: 1, companyId: 1 }, 'other-secret');
  assert.equal((await call(requireAuth, { headers: { authorization: `Bearer ${forged}` } })).status, 401);
});

test('requireAuth: sets tenant context to the JWT company', async () => {
  freshWorld();
  users = { 1: { id: 1, isActive: true, status: 'active' } };
  const r = await call(requireAuth, { headers: bearer({ userId: 1, companyId: 1 }) });
  assert.equal(r.status, 'next');
  assert.equal(r.tenant, 1);
  assert.equal(r.req.auth.companyId, 1);
});

test('requireAuth: deactivated / invited user → 403 ACCOUNT_DEACTIVATED', async () => {
  freshWorld();
  users = { 1: { id: 1, isActive: false, status: 'active' }, 2: { id: 2, isActive: true, status: 'invited' } };
  for (const userId of [1, 2, 99]) {
    const r = await call(requireAuth, { headers: bearer({ userId, companyId: 1 }) });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'ACCOUNT_DEACTIVATED');
  }
});

test('requireAuth: suspended / terminated company → 403 COMPANY_DEACTIVATED', async () => {
  const t = freshWorld();
  users = { 1: { id: 1, isActive: true, status: 'active' } };
  for (const status of ['suspended', 'terminated']) {
    t.Company.rows[0].status = status;
    const r = await call(requireAuth, { headers: bearer({ userId: 1, companyId: 1 }) });
    assert.equal(r.body.code, 'COMPANY_DEACTIVATED');
  }
  t.Company.rows[0].status = 'trial';
  assert.equal((await call(requireAuth, { headers: bearer({ userId: 1, companyId: 1 }) })).status, 'next');
});

test('requireAuth: X-Acting-Company-Id — every bad case is a hard 403, never a silent fallback', async () => {
  const t = freshWorld();
  users = { 1: { id: 1, isActive: true, status: 'active' } };
  const h = (v) => ({ ...bearer({ userId: 1, companyId: 1 }), 'X-Acting-Company-Id': v });

  // no group-level grant
  grant(1, ['employee:read'], { companyId: 1 });
  assert.equal((await call(requireAuth, { headers: h('2') })).body?.code, 'ACTING_COMPANY_FORBIDDEN');

  grant(1, ['employee:read'], { companyId: 1, groupId: 10 });
  assert.equal((await call(requireAuth, { headers: h('abc') })).status, 403, 'non-numeric');
  assert.equal((await call(requireAuth, { headers: h('2 OR 1=1') })).status, 403, 'injection-ish');
  assert.equal((await call(requireAuth, { headers: h('3') })).status, 403, 'company of another Group');
  assert.equal((await call(requireAuth, { headers: h('999') })).status, 403, 'unknown company');

  t.Company.rows[1].status = 'suspended';
  assert.equal((await call(requireAuth, { headers: h('2') })).body?.code, 'COMPANY_DEACTIVATED');
  t.Company.rows[1].status = 'active';

  const ok = await call(requireAuth, { headers: h('2') });
  assert.equal(ok.status, 'next');
  assert.equal(ok.req.auth.companyId, 2);
  assert.equal(ok.req.auth.homeCompanyId, 1);
  assert.equal(ok.tenant, 2);

  const same = await call(requireAuth, { headers: h('1') });
  assert.equal(same.req.auth.homeCompanyId, undefined, 'own company header is a no-op');
});

test('requireAuth: a company without a Group can never act elsewhere', async () => {
  const t = freshWorld();
  t.Company.insert({ id: 4, groupId: null, status: 'active' });
  users = { 1: { id: 1, isActive: true, status: 'active' } };
  grant(1, ['employee:read'], { companyId: 4, groupId: 10 });
  const r = await call(requireAuth, { headers: { ...bearer({ userId: 1, companyId: 4 }), 'X-Acting-Company-Id': '1' } });
  assert.equal(r.status, 403);
});

// ── 5. powerAuthority — nobody grants wider than they hold ─────────────
const power = { key: 'p', label: 'P', levels: ['brand', 'company', 'group'], permissionCodes: ['holiday:create', 'holiday:update'] };

test('powerAuthority: callerKind', () => {
  assert.equal(callerKind({ companyId: null, groupId: null }), 'super_admin');
  assert.equal(callerKind({ companyId: null, groupId: 10 }), 'group_admin');
  assert.equal(callerKind({ companyId: 1, groupId: null }), 'company');
  assert.equal(callerKind({ companyId: 2, homeCompanyId: 1 }), 'acting');
});

test('powerAuthority: company caller', async () => {
  freshWorld();
  grant(1, ['holiday:create', 'holiday:update']);
  const auth = { userId: 1, companyId: 1 };
  assert.equal(await checkGrantAuthority(auth, power, 'company', 4), null);
  assert.equal(await checkGrantAuthority(auth, power, 'brand', 4), null);
  assert.match(await checkGrantAuthority(auth, power, 'group', 4), /Group/);
});

test('powerAuthority: missing one code of the bundle → refused', async () => {
  freshWorld();
  grant(1, ['holiday:create']);
  assert.match(await checkGrantAuthority({ userId: 1, companyId: 1 }, power, 'brand', 4), /don't hold/);
});

test('powerAuthority: Brand caller only Brand level, only own Brand', async () => {
  freshWorld();
  grant(1, ['holiday:create', 'holiday:update'], { brandId: 4 });
  const auth = { userId: 1, companyId: 1 };
  assert.equal(await checkGrantAuthority(auth, power, 'brand', 4), null);
  assert.match(await checkGrantAuthority(auth, power, 'brand', 5), /own Brand/);
  assert.match(await checkGrantAuthority(auth, power, 'brand', null), /own Brand/);
  assert.match(await checkGrantAuthority(auth, power, 'company', 4), /Brand level/);
});

test('powerAuthority: acting caller can never grant; Super/Group Admin can', async () => {
  freshWorld();
  assert.match(await checkGrantAuthority({ userId: 1, companyId: 2, homeCompanyId: 1 }, power, 'brand', 4), /own company/);
  assert.equal(await checkGrantAuthority({ userId: 1, companyId: null, groupId: 10 }, power, 'group', 4), null);
  assert.equal(await checkGrantAuthority({ userId: 1, companyId: null, groupId: null }, power, 'group', 4), null);
});

// ── 6. approvalAccess — decide leave/OD/comp-off ───────────────────────
// Item: employee 50 of company 1, brand 4, snapshotted manager = employee 60.
const item = (over = {}) => ({
  id: 77,
  employeeId: 50,
  employee: { id: 50, companyId: 1, brandId: 4 },
  managerApprovals: [{ managerEmployeeId: 60 }],
  ...over,
});
const decide = (opts = {}, it = item()) =>
  requireApprovalDecisionAccess({
    resource: 'leave_request',
    action: 'approve',
    notFoundMessage: 'Leave request not found',
    loadAnyCompany: async () => it,
    ...opts,
  });
const run = (mw, auth) => call(mw, { auth, params: { id: '77' } });

test('approval: same-company admin decides as admin', async () => {
  freshWorld();
  grant(1, ['leave_request:approve']);
  const r = await run(decide(), { userId: 1, companyId: 1 });
  assert.equal(r.status, 'next');
  assert.equal(r.req.decision.mode, 'admin');
});

test('approval: Brand Admin of another brand → 403; of own brand → admin', async () => {
  freshWorld();
  grant(1, ['leave_request:approve'], { brandId: 5 });
  assert.equal((await run(decide(), { userId: 1, companyId: 1 })).status, 403);
  grant(2, ['leave_request:approve'], { brandId: 4 });
  assert.equal((await run(decide(), { userId: 2, companyId: 1 })).req.decision.mode, 'admin');
});

test('approval: admin of ANOTHER company → 404 (no existence leak)', async () => {
  freshWorld();
  grant(1, ['leave_request:approve'], { companyId: 2 });
  assert.equal((await run(decide(), { userId: 1, companyId: 2 })).status, 404);
});

test('approval: Group Admin — own Group decides under the item company, other Group 404', async () => {
  freshWorld();
  grant(7, ['leave_request:approve'], { companyId: null, groupId: 10 });
  const r = await run(decide(), { userId: 7, companyId: null, groupId: 10 });
  assert.equal(r.status, 'next');
  assert.equal(r.req.decision.companyId, 1);
  assert.equal(r.tenant, 1, 'runs under the item company');
  grant(8, ['leave_request:approve'], { companyId: null, groupId: 20 });
  assert.equal((await run(decide(), { userId: 8, companyId: null, groupId: 20 })).status, 404);
});

test('approval: snapshotted manager in a sibling company of the Group → manager vote', async () => {
  freshWorld();
  grant(3, ['leave_request:approve_reports'], { companyId: 2 });
  const r = await run(decide(), { userId: 3, companyId: 2, employeeId: 60 });
  assert.equal(r.status, 'next');
  assert.equal(r.req.decision.mode, 'manager');
  assert.equal(r.req.decision.companyId, 1);
});

test('approval: manager blocked when not snapshotted, outside the Group, without _reports, or adminOnly', async () => {
  freshWorld();
  grant(3, ['leave_request:approve_reports'], { companyId: 2 });
  assert.equal((await run(decide(), { userId: 3, companyId: 2, employeeId: 61 })).status, 404, 'not a snapshotted manager');
  assert.equal((await run(decide({ adminOnly: true }), { userId: 3, companyId: 2, employeeId: 60 })).status, 404, 'adminOnly');
  grant(4, ['leave_request:approve_reports'], { companyId: 3 });
  assert.equal((await run(decide(), { userId: 4, companyId: 3, employeeId: 60 })).status, 404, 'other Group');
  assert.equal((await run(decide(), { userId: 5, companyId: 1, employeeId: 60 })).status, 403, 'same company, no code');
});

test('approval history: own record via read_own, others not', async () => {
  freshWorld();
  grant(1, ['leave_request:read_own']);
  const req = (employeeId) => ({ auth: { userId: 1, companyId: 1, employeeId } });
  assert.equal(await resolveHistoryAccess({ req: req(50), request: item(), resource: 'leave_request', scopeCompanyId: 1 }), 1);
  assert.equal(await resolveHistoryAccess({ req: req(51), request: item(), resource: 'leave_request', scopeCompanyId: 1 }), null);
  assert.equal(await resolveHistoryAccess({ req: req(50), request: item(), resource: 'leave_request', scopeCompanyId: 2 }), null);
});

test('approval history: brand reader of another brand gets nothing', async () => {
  freshWorld();
  grant(1, ['leave_request:read'], { brandId: 5 });
  const req = { auth: { userId: 1, companyId: 1 } };
  assert.equal(await resolveHistoryAccess({ req, request: item(), resource: 'leave_request', scopeCompanyId: 1 }), null);
});
