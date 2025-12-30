const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  phoneHash: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  otp: {
    type: Number,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index:{
      expires:0,
    }
  },
  attempts: {
    type: Number,
    default: 0,
  },
  resendCount: {
    type: Number,
    default: 0,
  }
});

module.exports = mongoose.model("Otp", otpSchema);
