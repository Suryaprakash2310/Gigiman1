const Notification = require('../models/notification.model');

/**
 * Sends a notification to a User, Servicer, or Admin.
 * Handles both Database persistence and Socket.io emission.
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
            empId,
            empModel,
            adminId,
            targetRole,
            title,
            message,
            type,
            data
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

        return notification;
    } catch (err) {
        console.error('Error in sendNotification utility:', err.message);
        // We don't throw here to prevent breaking the main flow if notification fails
        return null;
    }
};
