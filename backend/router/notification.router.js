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
    clearAllAdminNotifications,
    updateUserFcmToken,
    updateServicerFcmToken,
    updateAdminFcmToken
} = require('../controllers/notification.controller');

// User notifications & FCM
router.get("/user", userProtect, getUserNotifications);
router.put("/user/read", userProtect, markUserNotificationsRead);
router.post("/user/fcm-token", userProtect, updateUserFcmToken);

// Servicer notifications & FCM
router.get("/servicer", protect, getServicerNotifications);
router.put("/servicer/read", protect, markServicerNotificationsRead);
router.post("/servicer/fcm-token", protect, updateServicerFcmToken);

// Admin notifications & FCM
router.get("/admin", protect, getAdminNotifications);
router.put("/admin/read", protect, markAdminNotificationsRead);
router.delete("/admin", protect, clearAllAdminNotifications);
router.post("/admin/fcm-token", protect, updateAdminFcmToken);

// Parameterized routes
router.put("/admin/:notificationId/read", protect, markSingleNotificationRead);
router.delete("/admin/:notificationId", protect, deleteSingleNotification);
router.put("/:notificationId/read", userProtect, markSingleNotificationRead);

module.exports = router;
