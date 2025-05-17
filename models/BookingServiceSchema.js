const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema({
  // userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
  subServiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Subservice", required: true },
  amount: { type: String, required: true },
  duration: { type: String, required: true },
  description: { type: String },
  other: [
    {
      key: { type: String },
      value: { type: String },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Booking", BookingSchema);