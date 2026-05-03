const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { userProtect } = require('../middleware/user.middleware');
const { 
    getUserNotifications, 
    markUserNotificationsRead, 
    getServicerNotifications, 
    markServicerNotificationsRead,
    getAdminNotifications,
    markAdminNotificationsRead
} = require('../controllers/notification.controller');

// User notifications
router.get("/user", userProtect, getUserNotifications);
router.put("/user/read", userProtect, markUserNotificationsRead);

// Servicer notifications
router.get("/servicer", protect, getServicerNotifications);
router.put("/servicer/read", protect, markServicerNotificationsRead);

// Admin notifications
router.get("/admin", protect, getAdminNotifications);
router.put("/admin/read", protect, markAdminNotificationsRead);

module.exports = router;
