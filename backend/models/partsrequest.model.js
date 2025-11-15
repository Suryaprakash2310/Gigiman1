const mongoose = require('mongoose');
const PART_REQUEST_STATUS = require('../enum/status.enum');

const partsrequestSchema = mongoose.Schema({
    jobId: {
        type: String,
        required: true,
        unique: true,
    },
    employeeId: {
        type: String,
        required: true,
    },
    shopId: {
        type: String,
        required: true,
    },
    parts: [{
        partsId: {
            type: mongoose.Types.ObjectId,
            ref: "Domainparts",
        },
        quantity: {
            type: Number,
            required: true,
        },
        price: {
            type: Number,
            required: true,
        },
    },
    ],
    userApproved: {
        type: Boolean,
        required: true,
    },
    totalCost: {
        type: Number,
        required: true,
    },
    OTP: {
        type: Number,
        required: true,
    },
    status: [{
        type: String,
        enum: Object(PART_REQUEST_STATUS),
        default: PART_REQUEST_STATUS.PENDING,
    },
    ],
},{timestamps:true})

module.exports = mongoose.model('PartRequest', partsrequestSchema);
