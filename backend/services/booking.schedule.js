 const Booking = require('../models/Booking.model');
 const {
  assignNextServicer,
  assignNextTeam
}  = require("../services/booking.service");
 const mongoose = require('mongoose');

 module.exports.startScheduler = (io) => {
  // console.log("🕒 Booking scheduler started");

  setInterval(async () => {
    try {
      const now = new Date();

      const booking = await Booking.findOneAndUpdate(
        {
          isScheduled: true,
          scheduleExecuted: false,
          scheduleDateTime: { $lte: now },
        },
        {
          $set: {
            scheduleExecuted: true,
            assignmentStatus: "SEARCHING", 
          },
        },
        { new: true }
      );

      if (!booking) {
        // console.log("😴 No due bookings");
        return;
      }

      // console.log("📦 Dispatching scheduled booking:", booking);

      if (booking.employeeCount === 1) {
        await assignNextServicer({
          bookingId: booking._id.toString(),
          coordinates: booking.location.coordinates,
          //employeeCount: booking.employeeCount,
          io,
        });
      } else {
        await assignNextTeam({
          bookingId: booking._id.toString(),
          coordinates: booking.location.coordinates,
          employeeCount: booking.employeeCount,
          io,
        });
      }
    } catch (err) {
      console.error("❌ Scheduler error:", err.message);
    }
  }, 50000);
};
