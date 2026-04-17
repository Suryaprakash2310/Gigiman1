const Notification = require('../models/notification.model');
const AppError = require('../utils/AppError');
const ROLES = require('../enum/role.enum');

// For Users
exports.getUserNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const notifications = await Notification.find({ userId })
            .sort({ createdAt: -1 })
            .limit(50); // limit to recent 50

        // Get unread count
        const unreadCount = await Notification.countDocuments({ userId, isRead: false });

        res.status(200).json({
            success: true,
            notifications,
            unreadCount
        });
    } catch (err) {
        next(err);
    }
};

exports.markUserNotificationsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;
        await Notification.updateMany({ userId, isRead: false }, { isRead: true });

        res.status(200).json({
            success: true,
            message: "Notifications marked as read"
        });
    } catch (err) {
        next(err);
    }
};

// For Servicers
exports.getServicerNotifications = async (req, res, next) => {
    try {
        const empId = req.employee.id;
        const notifications = await Notification.find({ empId })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({ empId, isRead: false });

        res.status(200).json({
            success: true,
            notifications,
            unreadCount
        });
    } catch (err) {
        next(err);
    }
};

exports.markServicerNotificationsRead = async (req, res, next) => {
    try {
        const empId = req.employee.id;
        await Notification.updateMany({ empId, isRead: false }, { isRead: true });

        res.status(200).json({
            success: true,
            message: "Notifications marked as read"
        });
    } catch (err) {
        next(err);
    }
};
