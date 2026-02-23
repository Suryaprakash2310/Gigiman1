const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const PartRequest = require("../models/partsrequest.model");
const Booking = require("../models/Booking.model");
const mongoose = require("mongoose");
const crons = require('node-cron')

const {
  servicerAccept,
  servicerReject,
  teamAccept,
  teamReject,
  requestTool,
  toolshopAccept,
  assignNextToolshop,
  toolshopReject,
  verifyPartOTP,
  verifyStartOTP,
  approveExtraService,
  proposeExtraService,
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
    socket.on("join-tracking", ({ bookingId }) => {
      if (!bookingId) return;

      socket.join(bookingId.toString());
      console.log(`Joined tracking room: ${bookingId}`);
    });

    /* ===============================
       SERVICER SENDS LIVE LOCATION
    =============================== */
    socket.on("send-location", async ({ bookingId, location }) => {
      try {
        if (!bookingId || !location) return;

        // Optional validation (recommended)
        // const booking = await Booking.findById(bookingId);
        // if (!booking) return;

        // Broadcast to USER only (room)
        socket.to(bookingId.toString()).emit(
          "servicer-location-update",
          {
            bookingId,
            latitude: location.latitude,
            longitude: location.longitude,
            heading: location.heading,
            eta: location.eta,
            updatedAt: new Date()
          }
        );

      } catch (err) {
        console.error("send-location error:", err.message);
      }
    });
    socket.on("visit-propose-service", async ({ bookingId, employeeId, serviceCategoryId }) => {
      try {
        const booking = await Booking.findOne({
          _id: bookingId,
          visitMode: true,
          primaryEmployee: employeeId,
          proposalStatus: { $in: ["NONE", "REJECTED"] }
        });

        if (!booking) return;

        const service = await ServiceList.findOne({
          "serviceCategory._id": serviceCategoryId
        }).lean();

        if (!service) return;

        const category = service.serviceCategory.find(
          c => c._id.toString() === serviceCategoryId
        );

        const proposal = {
          serviceCategoryId,
          serviceCategoryName: category.serviceCategoryName,
          price: category.price,
          durationInMinutes: category.durationInMinutes,
          employeeCount: category.employeeCount,
          proposedAt: new Date()
        };

        booking.proposedService = proposal;
        booking.proposalStatus = "PROPOSED";

        booking.proposalHistory.push({
          serviceCategoryName: category.serviceCategoryName,
          price: category.price,
          proposedBy: socket.userId,
          status: "PROPOSED",
          proposedAt: new Date()
        });

        await booking.save();

        // Send to USER
        io.to(booking.user.toString()).emit("service-proposed", {
          bookingId,
          proposal
        });

        // Auto-expire in 5 minutes
        setTimeout(async () => {
          const b = await Booking.findById(bookingId);
          if (b?.proposalStatus === "PROPOSED") {
            b.proposalStatus = "REJECTED";
            await b.save();

            io.to(socket.id).emit("service-rejected", {
              bookingId,
              reason: "User did not respond"
            });
          }
        }, 300000);

      } catch (err) {
        console.error("visit-propose-service:", err.message);
      }
    });
    socket.on("visit-approve-service", async ({ bookingId, userId, approve }) => {
      try {

        const booking = await Booking.findOne({
          _id: bookingId,
          user: userId,
          proposalStatus: "PROPOSED"
        });

        if (!booking) return;

        const employee = await SingleEmployee.findById(
          booking.primaryEmployee
        ).select("socketId");

        if (!approve) {
          booking.proposalStatus = "REJECTED";

          booking.proposalHistory.push({
            serviceCategoryName: booking.proposedService.serviceCategoryName,
            price: booking.proposedService.price,
            proposedBy: booking.primaryEmployee,
            status: "REJECTED",
            proposedAt: new Date()
          });

          await booking.save();

          if (employee?.socketId) {
            io.to(employee.socketId).emit("service-rejected", {
              bookingId
            });
          }
          return;
        }

        // APPROVED → Convert VISIT to SERVICE
        const p = booking.proposedService;

        booking.serviceCategoryName = p.serviceCategoryName;
        booking.pricePerService = p.price;
        booking.totalPrice = p.price;
        booking.durationInMinutes = p.durationInMinutes;
        booking.employeeCount = p.employeeCount;

        booking.visitMode = false;
        booking.proposalStatus = "APPROVED";
        booking.status = "ASSIGNED";

        booking.proposalHistory.push({
          serviceCategoryName: p.serviceCategoryName,
          price: p.price,
          proposedBy: booking.primaryEmployee,
          status: "APPROVED",
          proposedAt: new Date()
        });

        await booking.save();

        if (employee?.socketId) {
          io.to(employee.socketId).emit("service-approved", {
            bookingId,
            service: p.serviceCategoryName,
            totalPrice: p.price
          });
        }

      } catch (err) {
        console.error("visit-approve-service:", err.message);
      }
    });

    socket.on("extra-service-propose", async ({ bookingId, serviceCategoryId, employeeId }) => {
      try {
        await proposeExtraService({
          bookingId,
          serviceCategoryId,
          employeeId,
          io
        });
      } catch (err) {
        console.error("extra-service-propose error:", err.message);
        socket.emit("extra-service-error", { message: err.message });
      }
    });

    socket.on("extra-service-approve", async ({ bookingId, extraServiceId, approve, userId }) => {
      try {
        await approveExtraService({
          bookingId,
          extraServiceId,
          approve,
          userId,
          io
        });
      } catch (err) {
        console.error("extra-service-approve error:", err.message);
        socket.emit("extra-service-error", { message: err.message });
      }
    });



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
      try {
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
          console.log("not sucess");
          socket.emit("otp-failed", { message: "Invalid OTP" });
          return;
        }
        console.log("success");
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
        { socketId: null, isActive: false, availabilityStatus: "AVAILABLE", offerBookingId: null }
      );
      await MultipleEmployee.updateOne(
        { socketId: socket.id },
        { socketId: null, isActive: false, availabilityStatus: "AVAILABLE", offerBookingId: null }
      );
      await ToolShop.updateOne({ socketId: socket.id }, { socketId: null, availabilityStatus: "AVAILABLE", offerBookingId: null });
    });
  });
};
