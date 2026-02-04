const mongoose = require("mongoose");
const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const PAYMENT_STATUS = require("../enum/payment.enum");
const SERVICE_TYPE = require("../enum/bookingservicetype.enum");
const BOOKING_TYPE = require("../enum/bookingtype.enum");
const PAYMENT_METHOD = require("../enum/paymentmethod.enum");

const bookingSchema = new mongoose.Schema({

  /* ---------------- USER ---------------- */
  user: {
    type: mongoose.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  /* ---------------- SERVICE PROVIDER ---------------- */
  servicerCompany: {
    type: mongoose.Types.ObjectId,
    ref: "MultipleEmployee",
    default: null,
    index: true
  },

  serviceType: {
    type: String,
    enum: Object.values(SERVICE_TYPE),
    required: true,
    index: true
  },

  primaryEmployee: {
    type: mongoose.Types.ObjectId,
    ref: "SingleEmployee",
    default: null,
    index: true
  },

  employees: [{
    type: mongoose.Types.ObjectId,
    ref: "SingleEmployee"
  }],

  /* ---------------- SERVICE DETAILS ---------------- */
  serviceCategoryName: {
    type: String,
    required: true
  },

  domainService: {
    type: mongoose.Types.ObjectId,
    ref: "DomainService"
  },

  serviceCount: {
    type: Number,
    default: 1,
    min: 1
  },

  pricePerService: {
    type: Number,
    required: true
  },

  totalPrice: {
    type: Number,
    required: true
  },
  durationInMinutes: {
    type: Number,
    required: true
  },
  /* ---------------- BOOKING STATE ---------------- */
  status: {
    type: String,
    enum: Object.values(BOOKING_STATUS),
    default: BOOKING_STATUS.PENDING,
    index: true
  },

  bookingType: {
    type: String,
    enum: Object.values(BOOKING_TYPE),
    default: BOOKING_TYPE.ONDEMAND
  },
  visitMode: {
    type: Boolean,
    default: false,
    index: true
  },

  proposalStatus: {
    type: String,
    enum: ["NONE", "PROPOSED", "APPROVED", "REJECTED"],
    default: "NONE",
    index: true
  },

  proposedService: {
    serviceCategoryId: {
      type: mongoose.Types.ObjectId
    },
    serviceCategoryName: String,
    price: Number,
    durationInMinutes: Number,
    employeeCount: Number,
    proposedAt: Date
  },

  proposalHistory: [{
    serviceCategoryName: String,
    price: Number,
    proposedBy: {
      type: mongoose.Types.ObjectId,
      ref: "SingleEmployee"
    },
    status: String,
    proposedAt: Date
  }],
  assignmentStatus: {
    type: String,
    enum: ["SEARCHING", "OFFERED", "ASSIGNED", "FAILED"],
    default: "SEARCHING",
    index: true
  },

  offeredEmployee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SingleEmployee",
    default: null
  },

  assignmentExpiresAt: Date,
  dispatchAttempts: {
    type: Number,
    default: 0
  },
  /* ---------------- OTP ---------------- */
  StartWorkOTP: Number,
  toolOTP: Number,

  /* ---------------- PAYMENT ---------------- */
  paymentMethod: {
    type: String,
    enum: Object.values(PAYMENT_METHOD),
    default: null,
    index: true
  },
  scheduleDateTime: Date,
  isScheduled: Boolean,
  scheduleExecuted: {
    type: Boolean,
    default: false,
  },
  rejectedEmployees: [{
    type: mongoose.Types.ObjectId,
    ref: "SingleEmployee"
  }],
  rejectedMultipleEmployee: [{
    type: mongoose.Types.ObjectId,
    ref: "MultipleEmployee"
  }],
  rejectedToolShop: [{
    type: mongoose.Types.ObjectId,
    ref: "Shop"
  }],
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
    index: true
  },

  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,

  razorpayOrderId: String,
  razorpayOrderPaymentId: String,
  razorpaySignature: String,
  employeeCount: {
    type: Number,
    required: true,
  },

}, { timestamps: true });

/* ---------------- INDEXES ---------------- */
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ servicerCompany: 1, status: 1 });
bookingSchema.index({ primaryEmployee: 1, status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
