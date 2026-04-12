const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
    empId: {
        type: mongoose.Types.ObjectId,
        required: true,
        refPath: "empModel",
    },

    empType: {
        type: String,
        required: true,
    },

    empModel: {
        type: String,
        required: true,
        enum: ["SingleEmployee", "MultipleEmployee", "ToolShop"]
    },

    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ServiceList",
        required: true
    },

    totalAmount: Number,
    commissionAmount: Number,

    paidAmount: {
        type: Number,
        default: 0
    },

    status: {
        type: String,
        enum: ['PENDING', 'PARTIAL', 'PAID'],
        default: 'PENDING'
    },

    paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CommissionPayment",
        default: null
    }

}, { timestamps: true });

module.exports = mongoose.model('Commission', commissionSchema);