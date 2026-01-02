const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required:false,
  },

  phoneNo: {
    type: String,
    required: true,
  },

  phoneMasked: {
    type: String,
  },
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number],
      default: null,
    },
  },

  address: {
    type: String,
    required:false,
  },

  avatar: {
    type: String,
    required:false,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },

  socketId: {
    type: String,
    default: null,
  },

  socketConnectedAt: {
    type: Date,
  },

}, { timestamps: true });

UserSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", UserSchema);
