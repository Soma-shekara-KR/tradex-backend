// ══════════════════════════════════════════
//  user.routes.js
// ══════════════════════════════════════════
'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/user.controller');
const { authenticate, ownerOrAdmin } = require('../middleware/auth');
const { avatarUpload } = require('../middleware/upload');

router.use(authenticate);

router.get   ('/me',                             ctrl.getMe);
router.put   ('/me',                             ctrl.updateProfile);
router.post  ('/me/avatar',   avatarUpload.single('avatar'), ctrl.uploadAvatar);
router.get   ('/me/dashboard',                   ctrl.getDashboard);
router.get   ('/notifications',                  ctrl.getNotifications);
router.put   ('/notifications/:id/read',         ctrl.markNotificationRead);
router.put   ('/notifications/read-all',         ctrl.markAllNotificationsRead);

module.exports = router;
