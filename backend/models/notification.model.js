const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        default: null
    },
    empId: { 
        type: mongoose.Schema.Types.ObjectId, 
        refPath: 'empModel',
        default: null
    },
    empModel: { 
        type: String, 
        enum: ['SingleEmployee', 'MultipleEmployee', 'ToolShop', 'Admin'],
        default: null
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        default: null
    },
    title: { 
        type: String, 
        required: true 
    },
    message: { 
        type: String, 
        required: true 
    },
    isRead: { 
        type: Boolean, 
        default: false 
    },
    type: { 
        type: String, 
        enum: ['BOOKING', 'SYSTEM', 'ALERT', 'PROMO', 'FAILED_BOOKING', 'BLOCK'],
        default: 'SYSTEM'
    },
    targetRole: {
        type: String,
        default: null // Can be used for role-based notifications like 'ADMIN'
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
