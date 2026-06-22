'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

router.use(authenticate, authorize('admin','manager'));

router.get('/stats',                    ctrl.getDashboardStats);
router.get('/users',                    ctrl.getUsers);
router.get('/users/:id',                ctrl.getUser);
router.put('/users/:id/status', [
  body('status').isIn(['active','suspended','banned']),
], validate, ctrl.updateUserStatus);
router.put('/users/:id/kyc', [
  body('kycStatus').isIn(['not_submitted','pending','approved','rejected']),
], validate, ctrl.updateKycStatus);
router.get('/accounts',                 ctrl.getAllAccounts);
router.get('/transactions',             ctrl.getAllTransactions);
router.get('/audit-logs',               authorize('admin'), ctrl.getAuditLogs);

module.exports = router;
