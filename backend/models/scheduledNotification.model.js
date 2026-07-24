const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    time: {
        type: String,
        required: true,
        trim: true // Format: "HH:MM", e.g., "14:30" or "09:00"
    },
    targetAudience: {
        type: String,
        enum: ['all_users', 'employees', 'teams'],
        default: 'all_users',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastSentDate: {
        type: String,
        default: null // Format: "YYYY-MM-DD"
    }
}, { timestamps: true });

scheduledNotificationSchema.index({ time: 1, isActive: 1 });

module.exports = mongoose.model('ScheduledNotification', scheduledNotificationSchema);
