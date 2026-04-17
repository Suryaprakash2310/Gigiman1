const mongoose = require('mongoose');
const PART_REQUEST_STATUS = require('../enum/partsstatus.enum')

const partRequestSchema = mongoose.Schema({

    bookingId: {
        type: mongoose.Types.ObjectId,
        ref: "Booking",
        required: true,
    },

    employeeId: {
        type: mongoose.Types.ObjectId,
        ref: "SingleEmployee",
        required: true,
    },

    shopId: {
        type: mongoose.Types.ObjectId,
        ref: "ToolShop",
        default: null,
    },

    parts: [
        {
            partsId: {
                type: mongoose.Types.ObjectId,
                ref: "Domainparts",
                required: true
            },
            partName: {
                type: String,
                required: true,
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            price: {
                type: Number,
                required: true,
                min: 0
            }
        }
    ],

    totalCost: {
        type: Number,
        required: true,
        min: 0,
    },

    otp: {
        type: Number,
        default: null,
    },

    status: {
        type: String,
        enum: Object.values(PART_REQUEST_STATUS),
        default: PART_REQUEST_STATUS.PENDING,
    },

    approvalByUser: {
        type: Boolean,
        default: false,
    }

}, { timestamps: true });

module.exports = mongoose.model("PartRequest", partRequestSchema);
