const mongoose = require("mongoose");
const ROLES = require("../enum/role.enum");
const UserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
    },

    phoneNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    phoneMasked: String,

    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function (v) {
            return !v || v.length === 2;
          },
          message: "Coordinates must be [longitude, latitude]",
        },
      },
    },

    address: String,
    avatar: String,

    isVerified: {
      type: Boolean,
      default: false,
    },

    socketId: {
      type: String,
      default: null,
    },

    socketConnectedAt: Date,
    role:{
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
    }
  },
  { timestamps: true }
);

UserSchema.index(
  { location: "2dsphere" },
  {
    partialFilterExpression: {
      "location.coordinates": { $exists: true }
    }
  }
);

module.exports = mongoose.model("User", UserSchema);
