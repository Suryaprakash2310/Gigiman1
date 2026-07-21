const Notification = require('../models/notification.model');
const User = require('../models/user.model');
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const Admin = require('../models/admin.model');
const { sendFcmNotification } = require('./firebase.util');

/**
 * Sends a notification to a User, Servicer, or Admin.
 * Handles Database persistence, Socket.io emission, and FCM Push Notifications.
 */
exports.sendNotification = async ({
    userId = null,
    empId = null,
    empModel = null,
    adminId = null,
    targetRole = null,
    title,
    message,
    type = 'SYSTEM',
    data = {},
    io = null
}) => {
    try {
        // 1. Create Database Record
        const notification = await Notification.create({
            userId,
            user: userId,
            empId,
            empModel,
            adminId,
            targetRole,
            title,
            message,
            description: message,
            type,
            data,
            bookingId: data?.bookingId || null,
            serviceName: data?.serviceName || null,
            serviceDetails: data?.serviceDetails || null,
            metadata: data?.metadata || data || {}
        });

        // 2. Real-time Delivery via Socket.io
        if (io) {
            // To specific User
            if (userId) {
                io.to(userId.toString()).emit('notification', notification);
            }

            // To specific Servicer (Single, Team, or Shop)
            if (empId && empModel) {
                let room = '';
                if (empModel === 'SingleEmployee') room = `employee_${empId}`;
                else if (empModel === 'MultipleEmployee') room = `team_${empId}`;
                else if (empModel === 'ToolShop') room = `toolshop_${empId}`;

                if (room) {
                    io.to(room).emit('notification', notification);
                }
            }

            // To specific Admin or all Admins
            if (targetRole === 'ADMIN' || adminId) {
                io.to('admin_room').emit('notification', notification);
                
                // Special event for failed bookings to trigger immediate dashboard updates
                if (type === 'FAILED_BOOKING') {
                    io.to('admin_room').emit('new-failed-booking', {
                        ...data,
                        title,
                        message,
                        notificationId: notification._id
                    });
                }
            }
            
            // Special event for blocking to force logout or status update on client
            if (type === 'BLOCK') {
                if (empId) {
                    let room = '';
                    if (empModel === 'SingleEmployee') room = `employee_${empId}`;
                    else if (empModel === 'MultipleEmployee') room = `team_${empId}`;
                    else if (empModel === 'ToolShop') room = `toolshop_${empId}`;
                    
                    if (room) {
                        io.to(room).emit('account-blocked', { title, message });
                    }
                }
            }
        }

        // 3. FCM Push Notification Delivery
        const targetFcmTokens = [];

        // Collect FCM token for User
        if (userId) {
            const user = await User.findById(userId).select('fcmToken');
            if (user && user.fcmToken) {
                targetFcmTokens.push(user.fcmToken);
            }
        }

        // Collect FCM token for Servicer
        if (empId && empModel) {
            if (empModel === 'SingleEmployee') {
                const emp = await SingleEmployee.findById(empId).select('fcmToken');
                if (emp && emp.fcmToken) targetFcmTokens.push(emp.fcmToken);
            } else if (empModel === 'MultipleEmployee') {
                const team = await MultipleEmployee.findById(empId)
                    .populate('members', 'fcmToken')
                    .select('fcmToken members');
                if (team) {
                    if (team.fcmToken) targetFcmTokens.push(team.fcmToken);
                    if (Array.isArray(team.members)) {
                        team.members.forEach(m => {
                            if (m && m.fcmToken && !targetFcmTokens.includes(m.fcmToken)) {
                                targetFcmTokens.push(m.fcmToken);
                            }
                        });
                    }
                }
            } else if (empModel === 'ToolShop') {
                const shop = await ToolShop.findById(empId).select('fcmToken');
                if (shop && shop.fcmToken) targetFcmTokens.push(shop.fcmToken);
            }
        }

        // Collect FCM token for specific Admin
        if (adminId) {
            const adminDoc = await Admin.findById(adminId).select('fcmToken');
            if (adminDoc && adminDoc.fcmToken && !targetFcmTokens.includes(adminDoc.fcmToken)) {
                targetFcmTokens.push(adminDoc.fcmToken);
            }
        }

        // Collect FCM tokens for all Admins if targetRole === 'ADMIN'
        if (targetRole === 'ADMIN') {
            const adminDocs = await Admin.find({ fcmToken: { $ne: null } }).select('fcmToken');
            adminDocs.forEach(a => {
                if (a && a.fcmToken && !targetFcmTokens.includes(a.fcmToken)) {
                    targetFcmTokens.push(a.fcmToken);
                }
            });
        }

        // Send push notification via FCM if any tokens were found
        if (targetFcmTokens.length > 0) {
            await sendFcmNotification({
                fcmTokens: targetFcmTokens,
                title,
                body: message,
                data: {
                    ...data,
                    type: String(type),
                    notificationId: notification._id.toString()
                }
            });
        }

        return notification;
    } catch (err) {
        console.error('Error in sendNotification utility:', err.message);
        // We don't throw here to prevent breaking the main flow if notification fails
        return null;
    }
};
