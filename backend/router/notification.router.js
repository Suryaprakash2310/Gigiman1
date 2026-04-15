const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { userProtect } = require('../middleware/user.middleware');
const { 
    getUserNotifications, 
    markUserNotificationsRead, 
    getServicerNotifications, 
    markServicerNotificationsRead 
} = require('../controllers/notification.controller');

// User notifications
router.get("/user", userProtect, getUserNotifications);
router.put("/user/read", userProtect, markUserNotificationsRead);

// Servicer notifications
router.get("/servicer", protect, getServicerNotifications);
router.put("/servicer/read", protect, markServicerNotificationsRead);

module.exports = router;
