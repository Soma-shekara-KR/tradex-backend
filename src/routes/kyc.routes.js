'use strict';
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { kycUpload } = require('../middleware/upload');
const ctrl = require('../controllers/kyc.controller');

router.use(authenticate);

router.get ('/',              ctrl.getMyDocuments);
router.post('/upload', kycUpload.single('document'), [
  body('docType').isIn(['passport','national_id','drivers_license','utility_bill','bank_statement','selfie']),
], validate, ctrl.uploadDocument);

// Admin
router.get ('/pending',       authorize('admin','manager'), ctrl.getPendingKYC);
router.put ('/:id/review',    authorize('admin','manager'), [
  body('action').isIn(['approve','reject']),
  body('rejectionReason').optional().isString(),
], validate, ctrl.reviewDocument);

module.exports = router;
