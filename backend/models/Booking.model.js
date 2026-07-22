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
    refPath: "primaryEmployeeModel",
    default: null,
    index: true
  },
  primaryEmployeeModel: {
    type: String,
    enum: ["SingleEmployee", "MultipleEmployee"],
    default: "SingleEmployee"
  },
  externalTechnicianName: {
    type: String,
    default: null
  },
  externalTechnicianPhone: {
    type: String,
    default: null
  },

  employees: [{
    type: mongoose.Types.ObjectId,
    ref: "SingleEmployee"
  }],

  teamLeader: {
    type: mongoose.Types.ObjectId,
    refPath: "primaryEmployeeModel",
    default: null
  },
  teamHelpers: [{
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
  totalServicePrice: {
    type: Number,
    required: true,
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

  extraServices: [{
    serviceCategoryId: {
      type: mongoose.Types.ObjectId,
      ref: "ServiceList.serviceCategory"
    },
    serviceName: String,
    price: Number,
    durationInMinutes: Number,
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING"
    },
    requestedAt: { type: Date, default: Date.now },
    approvedAt: Date
  }],

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
    enum: ["SEARCHING", "OFFERED", "ASSIGNED", "FAILED", "SCHEDULED"],
    default: "SEARCHING",
    index: true
  },
  isManuallyAssigned: {
    type: Boolean,
    default: false,
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
  toolshopDispatchAttempts: {
    type: Number,
    default: 0
  },
  /* ---------------- OTP ---------------- */

  /* ---------------- PAYMENT ---------------- */
  paymentMethod: {
    type: String,
    enum: Object.values(PAYMENT_METHOD),
    default: null,
    index: true
  },
  scheduleDateTime: Date,
  isScheduled: {
    type: Boolean,
    default: false
  },
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
  addressTitle: {
    type: String,
    default: "",
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
    heading: {
      type: Number,
      default: 0
    },
    eta: {
      type: String,
      default: null
    }
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

  employeeCount: {
    type: Number,
    required: true,
    default: 1
  },
  
  cartItems: [{
    serviceCategoryId: mongoose.Types.ObjectId,
    serviceCategoryName: String,
    price: Number,
    durationInMinutes: Number,
    employeeCount: Number,
    quantity: {
      type: Number,
      default: 1
    }
  }],
  
  /* ---------------- COUPON / REFERRAL ---------------- */
  appliedCoupon: {
    type: mongoose.Types.ObjectId,
    ref: "Coupon",
    default: null
  },
  discountAmount: {
    type: Number,
    default: 0
  },

  paymentType: {
    type: String,
    enum: ["FULL", "ADVANCE"],
    default: "FULL"
  },
  advanceAmount: {
    type: Number,
    default: 0
  },
  remainingAmount: {
    type: Number,
    default: 0
  },
  assignmentNotes: {
    type: String,
    default: ""
  },
  statusHistory: [{
    status: String,
    updatedAt: { type: Date, default: Date.now },
    updatedBy: String,
    notes: String
  }],

}, { timestamps: true });

/* ---------------- INDEXES ---------------- */
bookingSchema.index({ location: "2dsphere" });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ servicerCompany: 1, status: 1 });
bookingSchema.index({ primaryEmployee: 1, status: 1 });

/* ---------------- PRE-SAVE HOOK FOR STATUS HISTORY ---------------- */
bookingSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      updatedAt: new Date(),
      updatedBy: this._updatedBy || 'SYSTEM',
      notes: this._statusNotes || `Status updated to ${this.status}`
    });
  }
  
  // Update remainingAmount for ADVANCE bookings
  if (this.paymentType === "ADVANCE" && this.paymentStatus === "partially_paid") {
    this.remainingAmount = Math.max(0, Math.round(this.totalPrice - this.advanceAmount));
  } else if (this.paymentStatus === "paid") {
    this.remainingAmount = 0;
  }
  next();
});

module.exports = mongoose.model("Booking", bookingSchema);
