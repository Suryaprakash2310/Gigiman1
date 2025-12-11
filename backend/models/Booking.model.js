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

    // Only required if the service type = TEAM
    servicerCompany: {
        type: mongoose.Types.ObjectId,
        ref: "MultipleEmployee",
        default: null
    },

    serviceType: {
        type: String,
        enum: Object.values(SERVICE_TYPE),  // "single", "team"
        required: true,
    },

    // For TEAM bookings only
    primaryEmployee: {
        type: mongoose.Types.ObjectId,
        ref: "SingleEmployee",
        default: null
    },
    employees: [{
        type: mongoose.Types.ObjectId,
        ref: "SingleEmployee",
    }],

    ServiceCategoryName: {
        type: Number,
        required: true,
    },

    domainService: {
        type: mongoose.Types.ObjectId,
        ref: "DomainService",
        required: false
    },

    status: {
        type: String,
        enum: Object.values(BOOKING_STATUS),
        default: BOOKING_STATUS.PENDING,
    },
    bookingType:{
        type:String,
        enum:Object.values(BOOKING_TYPE),
        default:BOOKING_TYPE.ONDEMAND,
    },
    scheduleDateTime:{
        type:Date,
        default:null
    },
    isSchduled:{
        type:Boolean,
        default:null,
    },
    schdeuleExecuted:{
        type:Boolean,
        default:false,
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
            required: true
        }
    },

    StartWorkOTP: {
        type: Number,
        default: null,
    },

    requestedTool: {
        type: String,
        default: null,
    },

    selectedToolShop: {
        type: mongoose.Types.ObjectId,
        ref: "ToolShop",
        default: null,
    },

    toolOTP: {
        type: Number,
        default: null,
    },

    paymentStatus: {
        type: String,
        enum: Object.values(PAYMENT_STATUS),
        default: PAYMENT_STATUS.PENDING,
    },

    razorpayOrderId: String,
    razorpayOrderPaymentId: String,
    razorpaySignature: String,

}, { timestamps: true });

// IMPORTANT for mapbox geo
bookingSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Booking", bookingSchema);
