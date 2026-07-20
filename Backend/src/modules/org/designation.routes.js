'use strict';

const { Router } = require('express');
const controller = require('./designation.controller');
const { requireAuth } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/rbac.middleware');

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission('designation:read'), controller.list);
router.get('/:id', requirePermission('designation:read'), controller.get);
router.post('/', requirePermission('designation:create'), controller.create);
router.patch('/:id', requirePermission('designation:update'), controller.update);
router.delete('/:id', requirePermission('designation:delete'), controller.remove);

module.exports = router;
