const cron = require('node-cron');
const ScheduledNotification = require('../models/scheduledNotification.model');
const User = require('../models/user.model');
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const { sendNotification } = require('../utils/notification.util');
const ROLES = require('../enum/role.enum');

const startNotificationScheduler = (io) => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            
            // Format current time as HH:MM in local server time
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const currentTime = `${hours}:${minutes}`;
            
            // Format current date as YYYY-MM-DD
            const currentDate = now.toISOString().split('T')[0];

            // Find active schedules for this time that haven't been sent today
            const activeSchedules = await ScheduledNotification.find({
                time: currentTime,
                isActive: true,
                lastSentDate: { $ne: currentDate }
            });

            if (activeSchedules.length === 0) {
                return;
            }

            console.log(`[ScheduledNotification] Found ${activeSchedules.length} schedules to run at ${currentTime}`);

            for (const schedule of activeSchedules) {
                const { title, message, targetAudience } = schedule;
                
                // Mark as sent first to prevent concurrent/duplicate triggers on restarts
                schedule.lastSentDate = currentDate;
                await schedule.save();

                console.log(`[ScheduledNotification] Dispatching "${title}" to ${targetAudience}`);

                let targets = [];
                if (targetAudience === "all_users") {
                    targets = await User.find({ role: ROLES.USER }, '_id');
                } else if (targetAudience === "employees") {
                    targets = await SingleEmployee.find({ isActive: true }, '_id');
                } else if (targetAudience === "teams") {
                    targets = await MultipleEmployee.find({ isActive: true }, '_id');
                }

                if (targets.length === 0) {
                    continue;
                }

                // Chunk send in batches of 50 to protect database connection pool
                const chunkSize = 50;
                for (let i = 0; i < targets.length; i += chunkSize) {
                    const chunk = targets.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(target => {
                        const payload = {
                            title,
                            message,
                            type: 'SYSTEM',
                            io
                        };
                        if (targetAudience === "all_users") {
                            payload.userId = target._id;
                        } else if (targetAudience === "employees") {
                            payload.empId = target._id;
                            payload.empModel = "SingleEmployee";
                        } else if (targetAudience === "teams") {
                            payload.empId = target._id;
                            payload.empModel = "MultipleEmployee";
                        }
                        return sendNotification(payload);
                    }));
                }

                console.log(`[ScheduledNotification] Successfully broadcasted schedule "${title}" to ${targets.length} targets`);
            }
        } catch (err) {
            console.error('[ScheduledNotification] Scheduler error:', err.message);
        }
    });
};

module.exports = { startNotificationScheduler };
