'use strict';

// In-memory stand-in for the Sequelize models the leave / probation code
// uses. Points the real config at a dead local address and makes every raw
// query throw, so a test can never reach a real database (the .env is prod).

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'no_real_db';
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const { Op } = require('sequelize');
const db = require('../src/models');

db.sequelize.query = async () => {
  throw new Error('Real DB query attempted in a test');
};
db.sequelize.transaction = async (fn) => fn({ fake: true });

function cmp(a, b) {
  if (a === b) return 0;
  return String(a) < String(b) ? -1 : 1;
}

function matchCond(val, cond) {
  if (cond === null) return val === null || val === undefined;
  if (typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
    return Reflect.ownKeys(cond).every((op) => {
      const c = cond[op];
      switch (op) {
        case Op.eq: return matchCond(val, c);
        case Op.ne: return c === null ? val !== null && val !== undefined : String(val) !== String(c);
        case Op.not: return c === null ? val !== null && val !== undefined : String(val) !== String(c);
        case Op.lt: return val != null && cmp(val, c) < 0;
        case Op.lte: return val != null && cmp(val, c) <= 0;
        case Op.gt: return val != null && cmp(val, c) > 0;
        case Op.gte: return val != null && cmp(val, c) >= 0;
        case Op.in: return c.map(String).includes(String(val));
        default: throw new Error(`fakeDb: unsupported operator ${String(op)}`);
      }
    });
  }
  return String(val) === String(cond);
}

function matches(row, where = {}) {
  return Reflect.ownKeys(where).every((key) => {
    if (key === Op.or) return where[key].some((w) => matches(row, w));
    if (key === Op.and) return where[key].every((w) => matches(row, w));
    return matchCond(row[key], where[key]);
  });
}

function sortRows(rows, order) {
  if (!order) return rows;
  return [...rows].sort((a, b) => {
    for (const [field, dir] of order) {
      const c = cmp(a[field], b[field]);
      if (c) return String(dir).toUpperCase() === 'DESC' ? -c : c;
    }
    return 0;
  });
}

function makeTable(defaults = {}) {
  const table = { rows: [], nextId: 1 };
  const wrap = (values) => {
    const row = { ...defaults, ...values };
    row.update = async (v) => Object.assign(row, v);
    row.reload = async () => row;
    row.get = () => row;
    return row;
  };
  table.insert = (values) => {
    const row = wrap({ id: table.nextId++, ...values });
    table.rows.push(row);
    return row;
  };
  table.model = {
    findOne: async ({ where, order } = {}) => sortRows(table.rows.filter((r) => matches(r, where)), order)[0] || null,
    findAll: async ({ where, order } = {}) => sortRows(table.rows.filter((r) => matches(r, where)), order),
    findByPk: async (id) => table.rows.find((r) => String(r.id) === String(id)) || null,
    count: async ({ where } = {}) => table.rows.filter((r) => matches(r, where)).length,
    create: async (values) => table.insert(values),
    update: async (values, { where } = {}) => {
      const hit = table.rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, values));
      return [hit.length];
    },
  };
  return table;
}

// Fresh in-memory tables wired onto the real `db` object.
function reset() {
  const t = {
    Company: makeTable({ yearlyCycleStartMonth: 1 }),
    Employee: makeTable({ status: 'active', isActive: true, gender: 'male', confirmedOn: null }),
    LeaveType: makeTable({ isPaid: true, carryForward: false, maxCarryForwardDays: null, deductFromLeaveTypeId: null, applicableGender: 'all', isWeekOffBucket: false }),
    LeavePolicy: makeTable({ isUnlimited: false, quotaHistory: null, partialYearMode: null }),
    RosterGroupLeavePolicy: makeTable(),
    LeaveBalance: makeTable({ used: 0, carriedForward: 0, accruedCredited: null, month: null }),
  };
  for (const name of ['Company', 'Employee', 'LeaveType', 'LeavePolicy', 'LeaveBalance']) {
    Object.assign(db[name], t[name].model);
  }
  // resolveLeavePolicy: findOne with include → { leavePolicy }.
  Object.assign(db.RosterGroupLeavePolicy, t.RosterGroupLeavePolicy.model, {
    findOne: async ({ where }) => {
      const link = t.RosterGroupLeavePolicy.rows.find((r) => matches(r, where));
      if (!link) return null;
      return { ...link, leavePolicy: t.LeavePolicy.rows.find((p) => String(p.id) === String(link.leavePolicyId)) };
    },
  });
  return t;
}

module.exports = { db, reset };
