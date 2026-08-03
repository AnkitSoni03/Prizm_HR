'use strict';

const db = require('../../models');
const redis = require('../../config/redis');

const CACHE_TTL_SECONDS = 6 * 60 * 60; // safety-net TTL; explicit invalidation is the primary path

function companyFaceCacheKey(companyId) {
  return `face:profiles:${companyId}`;
}

async function invalidateCompanyFaceCache(companyId) {
  await redis.del(companyFaceCacheKey(companyId));
}

// Cache-aside, one JSON blob per company — config/redis.js (and its
// memoryRedis.js local-dev stand-in) only expose get/set/del/publish, no
// HSET/SCAN, so a single per-company array is the natural shape for that
// minimal command surface. Scoped to companyId only (not brandId) so one
// cache entry serves every kiosk in the company; a brand-scoped kiosk
// filters the loaded array in-process (faceAttendance.service.js), after
// this returns, rather than needing a second cache key per brand.
async function loadCompanyFaceProfiles(companyId) {
  const cached = await redis.get(companyFaceCacheKey(companyId));
  if (cached) return JSON.parse(cached);

  const rows = await db.EmployeeFaceProfile.findAll({
    where: { companyId, status: 'active' },
    include: [{ model: db.Employee, as: 'employee', attributes: ['id', 'brandId', 'name', 'employeeCode'] }],
  });

  const payload = rows
    .filter((r) => r.employee) // an employee record could theoretically be gone (hard-deleted elsewhere); skip rather than crash the whole cache load
    .map((r) => ({
      employeeId: String(r.employeeId),
      brandId: r.employee.brandId ? String(r.employee.brandId) : null,
      name: r.employee.name,
      employeeCode: r.employee.employeeCode,
      embeddings: [r.embeddingFront, r.embeddingLeft, r.embeddingRight],
    }));

  await redis.set(companyFaceCacheKey(companyId), JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS);
  return payload;
}

module.exports = { companyFaceCacheKey, invalidateCompanyFaceCache, loadCompanyFaceProfiles };
