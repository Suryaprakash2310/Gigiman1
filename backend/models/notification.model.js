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
        enum: ['SingleEmployee', 'MultipleEmployee', 'ToolShop'],
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
        default: 'SYSTEM' // e.g., BOOKING, SYSTEM, ALERT, PROMO
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
