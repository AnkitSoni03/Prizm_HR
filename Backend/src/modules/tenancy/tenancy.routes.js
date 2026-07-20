'use strict';

const { Router } = require('express');
const groupRoutes = require('./group.routes');
const companyRoutes = require('./company.routes');
const planRoutes = require('./plan.routes');

const router = Router();

router.use('/groups', groupRoutes);
router.use('/companies', companyRoutes);
router.use('/plans', planRoutes);

module.exports = router;
