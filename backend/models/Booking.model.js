const mongoose = require('mongoose');
const BOOKING_STATUS = require('../enum/bookingstatus.enum');
const PAYMENT_STATUS = require('../enum/payment.enum');
const SERVICE_TYPE = require('../enum/bookingservicetype.enum');
const BOOKING_TYPE = require('../enum/bookingtype.enum');

const bookingSchema = mongoose.Schema({
    user: {
        type: mongoose.Types.ObjectId,
        ref: "User",
        required: true,
    },

    servicerCompany: {
        type: mongoose.Types.ObjectId,
        ref: "MultipleEmployee",
        default: null,
    },

    serviceType: {
        type: String,
        enum: Object.values(SERVICE_TYPE),
        required: true,
    },

    primaryEmployee: {
        type: mongoose.Types.ObjectId,
        ref: "SingleEmployee",
        default: null,
    },

    employees: [{
        type: mongoose.Types.ObjectId,
        ref: "SingleEmployee",
    }],
    serviceCategoryName: {
        type: String,
        required: true,
    },

    domainService: {
        type: mongoose.Types.ObjectId,
        ref: "DomainService",
    },

    //  USER CAN INCREASE THIS
    serviceCount: {
        type: Number,
        default: 1,
        min: 1,
    },

    //  PRICE FROM SERVICE CATEGORY
    pricePerService: {
        type: Number,
        required: true,
    },

    //  FINAL CALCULATED PRICE
    totalPrice: {
        type: Number,
        required: true,
    },

    status: {
        type: String,
        enum: Object.values(BOOKING_STATUS),
        default: BOOKING_STATUS.PENDING,
    },

    bookingType: {
        type: String,
        enum: Object.values(BOOKING_TYPE),
        default: BOOKING_TYPE.ONDEMAND,
    },
    assignmentStatus: {
        type: String,
        enum: ["SEARCHING", "OFFERED", "ASSIGNED", "FAILED"],
        default: "SEARCHING",
    },

    offeredEmployee: {
        type: mongoose.Types.ObjectId,
        ref: "SingleEmployee",
        default: null,
    },

    assignmentExpiresAt: {
        type: Date,
        default: null,
    },

    dispatchAttempts: {
        type: Number,
        default: 0,
    },

    userSocketId: {
        type: String,
        default: null,
    },


    scheduleDateTime: Date,
    isScheduled: Boolean,
    scheduleExecuted: {
        type: Boolean,
        default: false,
    },

    address: {
        type: String,
        required: true,
    },

    location: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point",
        },
        coordinates: {
            type: [Number],
            required: true,
        },
    },

    StartWorkOTP: Number,

    requestedTool: String,

    selectedToolShop: {
        type: mongoose.Types.ObjectId,
        ref: "ToolShop",
    },

    toolOTP: Number,

    paymentStatus: {
        type: String,
        enum: Object.values(PAYMENT_STATUS),
        default: PAYMENT_STATUS.PENDING,
    },

    razorpayOrderId: String,
    razorpayOrderPaymentId: String,
    razorpaySignature: String,
    employeeCount:{
        type: Number,
        default:1,
    }
}, { timestamps: true });

bookingSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Booking", bookingSchema);
