const Booking = require('../models/Booking.model');
const { autoAssignServicer, assignNextTeam } = require("../services/booking.service");
const mongoose = require('mongoose');

module.exports.startScheduler = (io) => {
    console.log("booking schedule");
    setInterval(async () => {
        try {
            const now = new Date();

            const booking = await Booking.findOneAndUpdate(
                {
                    isScheduled: true,
                    scheduleExecuted: false,
                    scheduleDateTime: { $lte: now },
                    assignmentStatus: "SEARCHING"
                },
                {
                    $set: {
                        scheduleExecuted: true,
                        assignmentStatus: "OFFERED"
                    }
                },
                { new: true },
            );
            if (!booking) return;

            const payload = {
                bookingId: booking._id,
                coordinates: booking.location.coordinates,
                employeeCount: booking.employeeCount,
                io
            };
            if (booking.employeeCount === 1) {
                await autoAssignServicer(payload);
            } else {
                await assignNextTeam(payload);
            }
        }
        catch(err){
            console.error("schedule error:",err.message);
        }
    },50000);
}