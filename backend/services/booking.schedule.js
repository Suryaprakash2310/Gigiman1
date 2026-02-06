 const Booking = require('../models/Booking.model');
 const { autoAssignServicer, assignNextTeam } = require("../services/booking.service");
 const mongoose = require('mongoose');

// module.exports.startScheduler = (io) => {
//     console.log("booking schedule");
//     setInterval(async () => {
//         try {
//             const now = new Date();

//             const booking = await Booking.findOneAndUpdate(
//                 {
//                     isScheduled: true,
//                     scheduleExecuted: false,
//                     scheduleDateTime: { $lte: now },
//                     assignmentStatus: "SEARCHING"
//                 },
//                 {
//                     $set: {
//                         scheduleExecuted: true,
//                         assignmentStatus: "OFFERED"
//                     }
//                 },
//                 { new: true },
//             );
//             if (!booking) return;

//             const payload = {
//                 bookingId: booking._id,
//                 coordinates: booking.location.coordinates,
//                 employeeCount: booking.employeeCount,
//                 io
//             };
//             if (booking.employeeCount === 1) {
//                 await autoAssignServicer(payload);
//             } else {
//                 await assignNextTeam(payload);
//             }
//         }
//         catch(err){
//             console.error("schedule error:",err.message);
//         }
//     },50000);
// }
module.exports.startScheduler = (io) => {
  console.log("🕒 [SCHEDULER] Booking scheduler started");

  setInterval(async () => {
    const tickTime = new Date();
    console.log("⏱️ [SCHEDULER] Tick at:", tickTime.toISOString());

    try {
      const now = new Date();

      const dueBookings = await Booking.find({
        isScheduled: true,
        scheduleExecuted: false,
        scheduleDateTime: { $lte: now },
        status: "SCHEDULED",
        assignmentStatus: "SCHEDULED"
      }).limit(10);

      console.log(
        `📦 [SCHEDULER] Found ${dueBookings.length} due booking(s)`
      );

      for (const b of dueBookings) {
        console.log(
          `🔍 [SCHEDULER] Processing booking ${b._id} | Employees: ${b.employeeCount}`
        );

        const booking = await Booking.findOneAndUpdate(
          { _id: b._id, scheduleExecuted: false },
          {
            $set: {
              scheduleExecuted: true,
              assignmentStatus: "SEARCHING",
              status: "SEARCHING"
            }
          },
          { new: true }
        );

        if (!booking) {
          console.warn(
            `⚠️ [SCHEDULER] Booking ${b._id} already locked by another worker`
          );
          continue;
        }

        console.log(
          `🚀 [SCHEDULER] Booking ${booking._id} moved to SEARCHING`
        );

        const payload = {
          bookingId: booking._id,
          coordinates: booking.location.coordinates,
          employeeCount: booking.employeeCount,
          io
        };

        if (booking.employeeCount === 1) {
          console.log(
            `👤 [SCHEDULER] Assigning SINGLE employee for booking ${booking._id}`
          );
          await autoAssignServicer(payload);
        } else {
          console.log(
            `👥 [SCHEDULER] Assigning TEAM (${booking.employeeCount}) for booking ${booking._id}`
          );
          await assignNextTeam(payload);
        }
      }

      if (dueBookings.length === 0) {
        console.log("😴 [SCHEDULER] No due bookings this cycle");
      }

    } catch (err) {
      console.error("❌ [SCHEDULER] Error occurred:", err);
    }
  }, 60000);
};
