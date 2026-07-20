'use strict';

const { Router } = require('express');
const controller = require('./companyPolicy.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { upload } = require('../../middleware/upload.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('company_policy:read'), controller.list);
router.post('/', requirePermission('company_policy:create'), controller.create);
router.patch('/:id', requirePermission('company_policy:update'), controller.update);
router.delete('/:id', requirePermission('company_policy:delete'), controller.remove);
// Same permission as editing the policy itself — no separate gate.
router.post('/:id/attachment', requirePermission('company_policy:update'), upload.single('file'), controller.uploadAttachment);

module.exports = router;
