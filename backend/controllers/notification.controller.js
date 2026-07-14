const Notification = require('../models/notification.model');
const AppError = require('../utils/AppError');
const ROLES = require('../enum/role.enum');

// For Users
exports.getUserNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || (req.query.page ? 20 : 50);
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get unread count
        const unreadCount = await Notification.countDocuments({ userId, isRead: false });
        const totalCount = await Notification.countDocuments({ userId });

        res.status(200).json({
            success: true,
            notifications,
            unreadCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            totalCount
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

// For Admins
exports.getAdminNotifications = async (req, res, next) => {
    try {
        const adminId = req.employee.id;
        
        // Admins can see notifications directed specifically to them (adminId) 
        // OR general admin notifications (targetRole: 'ADMIN')
        const notifications = await Notification.find({
            $or: [
                { adminId },
                { targetRole: 'ADMIN' }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            $or: [
                { adminId },
                { targetRole: 'ADMIN' }
            ],
            isRead: false
        });

        res.status(200).json({
            success: true,
            notifications,
            unreadCount
        });
    } catch (err) {
        next(err);
    }
};

exports.markAdminNotificationsRead = async (req, res, next) => {
    try {
        const adminId = req.employee.id;
        await Notification.updateMany({
            $or: [
                { adminId },
                { targetRole: 'ADMIN' }
            ],
            isRead: false
        }, { isRead: true });

        res.status(200).json({
            success: true,
            message: "Admin notifications marked as read"
        });
    } catch (err) {
        next(err);
    }
};

exports.markSingleNotificationRead = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        if (!notificationId) {
            return next(new AppError("notificationId is required", 400));
        }

        const notification = await Notification.findByIdAndUpdate(notificationId, { isRead: true }, { new: true });
        if (!notification) {
            return next(new AppError("Notification not found", 404));
        }

        res.status(200).json({
            success: true,
            message: "Notification marked as read",
            notification
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteSingleNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        await Notification.findByIdAndDelete(notificationId);
        res.status(200).json({
            success: true,
            message: "Notification deleted"
        });
    } catch (err) {
        next(err);
    }
};

exports.clearAllAdminNotifications = async (req, res, next) => {
    try {
        const adminId = req.employee.id;
        await Notification.deleteMany({
            $or: [
                { adminId },
                { targetRole: 'ADMIN' }
            ]
        });
        res.status(200).json({
            success: true,
            message: "All admin notifications cleared"
        });
    } catch (err) {
        next(err);
    }
};
