const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const PartRequest = require("../models/partsrequest.model");
const Booking = require("../models/Booking.model");
const mongoose = require("mongoose");
const crons=require('node-cron')

const {
  servicerAccept,
  servicerReject,
  teamAccept,
  teamReject,
  requestTool,
  toolshopAccept,
  toolshopReject,
  verifyPartOTP,
  verifyStartOTP,
} = require("../services/booking.service");

const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const PART_REQUEST_STATUS = require("../enum/partsstatus.enum");
//const mongoose = require("mongoose");

const isValidId = id =>
  id && mongoose.Types.ObjectId.isValid(id);

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    /* ===============================
       REGISTER SOCKETS
    =============================== */
    socket.on("register-user", async ({ userId }) => {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return;
      }

      socket.join(userId.toString());
      const updated = await User.findByIdAndUpdate(
        userId,
        { socketId: socket.id },
        { new: true }
      );
    });

    socket.on("register-employee", async ({ employeeId }) => {
      if (!mongoose.Types.ObjectId.isValid(employeeId)) return;
      const room = `employee_${employeeId}`;
      socket.join(room);
      await SingleEmployee.findByIdAndUpdate(employeeId, {
        socketId: socket.id,
        isActive: true,
      });
    });
    socket.on("register-team", async ({ teamId }) => {
      await MultipleEmployee.findByIdAndUpdate({ _id: teamId }, {
        socketId: socket.id,
        isActive: true,
      });
    });

    socket.on("register-toolshop", async ({ shopId }) => {
      if (!shopId || !mongoose.Types.ObjectId.isValid(shopId)) {
        return;
      }

      await ToolShop.findByIdAndUpdate(shopId, {
        socketId: socket.id,
        isActive: true,
      });
    });
    /* ===============================
       ACCEPT / REJECT
    =============================== */
    socket.on("servicer-accept", async ({ bookingId, employeeId }) => {
      try {
        if (!io) {
          console.error("IO instance missing for booking:", bookingId);
          return;
        }
        await servicerAccept(bookingId, employeeId, io);
      } catch (err) {
        console.error("servicer-accept error:", err);
      }
    });

    socket.on("servicer-reject", async ({ bookingId, employeeId }) => {
      try {
        if (!io) {
          console.error("IO instance missing for booking:", bookingId);
          return;
        }
        await servicerReject({ bookingId, employeeId, io });
      } catch (err) {
        console.error("servicer-reject error:", err);
      }
    });
    socket.on("team-accept", async (payload) => {
      const result = await teamAccept({
        ...payload,
        io
      });

      socket.emit("team-accept-result", result);
    });


    socket.on("team-reject", ({ bookingId }) =>
      teamReject(bookingId, io)
    );

    /* ===============================
       TEAM ASSIGN MEMBERS
    =============================== */
    socket.on("team-assign-members", async ({ bookingId, teamId, primaryEmployee, helpers = [] }) => {
      try {
        /* ============================
           1. Fetch & validate booking
        ============================ */
        const booking = await Booking.findOne({
          _id: bookingId,
          serviceType: "team",
          status: BOOKING_STATUS.PENDING,
          servicerCompany: teamId,
        });

        if (!booking) return;

        /* ============================
           2. Fetch & validate team
        ============================ */
        const team = await MultipleEmployee.findOne({
          _id: teamId,
          teamStatus: "BUSY", // must be BUSY after team-accept
        });

        if (!team) return;

        /* ============================
           3. Validate members
        ============================ */
        const teamMemberIds = team.members.map(id => id.toString());

        if (!teamMemberIds.includes(primaryEmployee)) return;

        for (const helper of helpers) {
          if (!teamMemberIds.includes(helper)) return;
        }

        /* ============================
           4. Assign employees atomically
        ============================ */
        booking.primaryEmployee = primaryEmployee;
        booking.employees = [primaryEmployee, ...helpers];
        booking.status = BOOKING_STATUS.ASSIGNED;
        await booking.save();

        /* ============================
           5. Mark employees BUSY
        ============================ */
        await SingleEmployee.updateMany(
          { _id: { $in: booking.employees } },
          {
            availabilityStatus: "BUSY",
            offerBookingId: null,
          }
        );
        const user = await User.findById(booking.user).select("socketId");
        if (user?.socketId) {
          io.to(user.socketId).emit("team-assigned", booking);
        }

        const employees = await SingleEmployee.find({
          _id: { $in: booking.employees },
        }).select("socketId");

        employees.forEach(emp => {
          if (emp.socketId) {
            io.to(emp.socketId).emit("team-member-assigned", booking);
          }
        });

      } catch (err) {
        console.error("team-assign-members error:", err);
      }
    }
    );

    /* ===============================
    TOOL / PART REQUEST FLOW
    =============================== */

    // Employee requests a tool / part
    socket.on("tool-request", async ({ bookingId, toolName }) => {
      try {
        const partRequest = await requestTool(bookingId, toolName);

        const booking = await Booking.findById(bookingId);
        const user = await User.findById(booking.user).select("socketId");
        if (user?.socketId) {
          io.to(user.socketId).emit("tool-approval-required", {
            requestId: partRequest._id,
            toolName,
          });
        }
      } catch (err) {
        socket.emit("tool-request-failed", err.message);
      }
    });


    // User approves tool request
    socket.on("tool-permission-approved", async ({ requestId }) => {
      try {
        const req = await PartRequest.findOneAndUpdate(
          {
            _id: requestId,
            status: PART_REQUEST_STATUS.REQUESTED,
          },
          {
            $set: {
              status: PART_REQUEST_STATUS.APPROVED,
              approvalByUser: true,
            },
          },
          { new: true }
        );

        if (!req) return;

        const booking = await Booking.findById(req.bookingId);

        // Start optimized toolshop assignment
        await assignNextToolshop({
          requestId,
          coordinates: booking.location.coordinates,
          io,
        });

      } catch (err) {
        console.error("tool-permission-approved error:", err);
      }
    });


    // ToolShop accepts request
    socket.on("toolshop-accept", async ({ requestId, shopId }) => {
      try {console.log("toolshop-accept event received");
        console.log(requestId,shopId);
        await toolshopAccept({ requestId, shopId, io });
      } catch (err) {
        console.error("toolshop-accept error:", err);
      }
    });


    // ToolShop rejects request
    socket.on("toolshop-reject", async ({ requestId, shopId }) => {
      try {
        await toolshopReject({ requestId, shopId, io });
      } catch (err) {
        console.error("toolshop-reject error:", err);
      }
    });


    // Employee verifies OTP when collecting tool
    socket.on("verify-part-otp", async ({ requestId, otp }) => {
      try {
        const result = await verifyPartOTP(requestId, otp);

        if (!result.success) {
          socket.emit("otp-failed", { message: "Invalid OTP" });
          return;
        }

        socket.emit("part-otp-success", result);

      } catch (err) {
        socket.emit("otp-failed", { message: err.message });
      }
    });

    socket.on("verify-start-otp", async ({ bookingId, otp }) => {
      try {
        const result = await verifyStartOTP(bookingId, otp); 
        if (!result.success) {
          socket.emit("start-otp-failed", { message: "Invalid OTP" });
          return;
        } 
        socket.emit("otp-success", result);
      } catch (err) {
        socket.emit("otp-failed", { message: err.message });
      }   
    });

    /* ===============================
       USER CANCEL
    =============================== */
    socket.on("user-cancel-booking", async ({ bookingId }) => {
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        { status: BOOKING_STATUS.CANCALLED },
        { new: true }
      );
      if (!booking) return;

      const employees = await SingleEmployee.find({
        _id: { $in: booking.employees },
      });

      employees.forEach(emp => {
        emp.socketId &&
          io.to(emp.socketId).emit("booking-cancelled-by-user", bookingId);
      });
    });

    /* ===============================
       DISCONNECT
    =============================== */
    socket.on("disconnect", async () => {
      await User.updateOne({ socketId: socket.id }, { socketId: null });
      await SingleEmployee.updateOne(
        { socketId: socket.id },
        { socketId: null, isActive: false,availabilityStatus:"AVAILABLE",offerBookingId:null }
      );
      await MultipleEmployee.updateOne(
        { socketId: socket.id },
        { socketId: null, isActive: false,availabilityStatus:"AVAILABLE",offerBookingId:null  }
      );
      await ToolShop.updateOne({ socketId: socket.id }, { socketId: null,availabilityStatus:"AVAILABLE",offerBookingId:null  });
    });
  });
};
