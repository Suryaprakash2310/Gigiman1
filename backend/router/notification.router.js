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
    markAdminNotificationsRead,
    markSingleNotificationRead,
    deleteSingleNotification,
    clearAllAdminNotifications
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
router.delete("/admin", protect, clearAllAdminNotifications);

// Parameterized routes
router.put("/admin/:notificationId/read", protect, markSingleNotificationRead);
router.delete("/admin/:notificationId", protect, deleteSingleNotification);
router.put("/:notificationId/read", userProtect, markSingleNotificationRead);

module.exports = router;
