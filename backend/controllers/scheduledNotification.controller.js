const ScheduledNotification = require('../models/scheduledNotification.model');
const AppError = require('../utils/AppError');

exports.createScheduledNotification = async (req, res, next) => {
    try {
        const { title, message, time, targetAudience } = req.body;

        if (!title || !message || !time) {
            return next(new AppError("Title, message, and time are required", 400));
        }

        // Validate time format (HH:MM, allowing single digits or double digits for hours)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            return next(new AppError("Invalid time format. Use HH:MM (e.g. 14:30)", 400));
        }

        // Normalize time (pad hour with zero if necessary, e.g. "9:30" -> "09:30")
        const [hr, min] = time.split(':');
        const normalizedTime = `${hr.padStart(2, '0')}:${min}`;

        const scheduled = await ScheduledNotification.create({
            title,
            message,
            time: normalizedTime,
            targetAudience: targetAudience || 'all_users'
        });

        res.status(201).json({
            success: true,
            message: "Notification scheduled successfully",
            scheduled
        });
    } catch (err) {
        next(err);
    }
};

exports.getScheduledNotifications = async (req, res, next) => {
    try {
        const schedules = await ScheduledNotification.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: schedules.length,
            schedules
        });
    } catch (err) {
        next(err);
    }
};

exports.toggleScheduledNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const schedule = await ScheduledNotification.findById(id);

        if (!schedule) {
            return next(new AppError("Scheduled notification not found", 404));
        }

        schedule.isActive = !schedule.isActive;
        await schedule.save();

        res.status(200).json({
            success: true,
            message: `Schedule ${schedule.isActive ? 'activated' : 'deactivated'} successfully`,
            schedule
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteScheduledNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        const schedule = await ScheduledNotification.findByIdAndDelete(id);

        if (!schedule) {
            return next(new AppError("Scheduled notification not found", 404));
        }

        res.status(200).json({
            success: true,
            message: "Scheduled notification deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};
