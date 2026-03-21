const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const PartRequest = require("../models/partsrequest.model");
const Booking = require("../models/Booking.model");
const mongoose = require("mongoose");
const ROLES = require("../enum/role.enum");
const ServiceList = require("../models/serviceList.model");
const Ticket = require("../models/ticket.model");
const TicketMessage = require("../models/ticketMessage.model");

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


module.exports = (io) => {
  io.on("connection", async (socket) => {
    console.log("Socket connected:", socket.id, "Role:", socket.role);

    /* ===============================
       AUTO-REGISTER SOCKETID & JOIN ROOMS
    =============================== */
    try {
      if (socket.role === ROLES.USER) {
        socket.join(socket.userId);
        await User.findByIdAndUpdate(socket.userId, { socketId: socket.id });
      } else if (socket.role === ROLES.SINGLE_EMPLOYEE) {
        socket.join(`employee_${socket.employeeId}`);
        await SingleEmployee.findByIdAndUpdate(socket.employeeId, {
          socketId: socket.id,
          isActive: true,
        });
      } else if (socket.role === ROLES.MULTIPLE_EMPLOYEE) {
        socket.join(`team_${socket.teamId}`);
        await MultipleEmployee.findByIdAndUpdate(socket.teamId, {
          socketId: socket.id,
          isActive: true,
        });
      } else if (socket.role === ROLES.TOOL_SHOP) {
        socket.join(`toolshop_${socket.shopId}`);
        await ToolShop.findByIdAndUpdate(socket.shopId, {
          socketId: socket.id,
          isActive: true,
        });
      }
    } catch (err) {
      console.error("Error updating socketId on connection:", err.message);
    }
    /* ===============================
       ACCEPT / REJECT
    =============================== */
    socket.on("servicer-accept", async ({ bookingId }) => {
      try {
        if (socket.role !== ROLES.SINGLE_EMPLOYEE) return;
        await servicerAccept(bookingId, socket.employeeId, io);
      } catch (err) {
        console.error("servicer-accept error:", err);
      }
    });

    socket.on("servicer-reject", async ({ bookingId }) => {
      try {
        if (socket.role !== ROLES.SINGLE_EMPLOYEE) return;
        await servicerReject({ bookingId, employeeId: socket.employeeId, io });
      } catch (err) {
        console.error("servicer-reject error:", err);
      }
    });
    socket.on("team-accept", async (payload) => {
      if (socket.role !== ROLES.MULTIPLE_EMPLOYEE) return;
      const result = await teamAccept({
        ...payload,
        teamId: socket.teamId,
        io
      });

      socket.emit("team-accept-result", result);
    });


    socket.on("team-reject", ({ bookingId }) =>
      teamReject(bookingId, io)
    );
    socket.on("join-tracking", (payload) => {
      const bookingId = payload?.bookingId || payload;
      if (!bookingId) return;

      const room = bookingId.toString();
      socket.join(room);
      console.log(`[Socket] ${socket.id} (Role: ${socket.role}) joined tracking room: ${room}`);
    });

    /* =================================
       LIVE LOCATION TRACKING (BIDIRECTIONAL)
    ================================= */
    socket.on("send-location", async (payload) => {
      try {
        const { bookingId, location, latitude, longitude, heading, eta } = payload || {};
        if (!bookingId) return;

        // Support both nested {location: {lat, lng}} and flat {lat, lng} structures
        const lat = location?.latitude || latitude;
        const lng = location?.longitude || longitude;
        const head = location?.heading || heading || 0;
        const reachTime = location?.eta || eta;

        if (lat === undefined || lng === undefined) {
          console.warn("[Socket] send-location: Missing latitude or longitude in payload", payload);
          return;
        }

        const room = bookingId.toString();

        // Determine event name based on sender's role
        // If User sends location -> emit "user-location-update" (for servicer to see)
        // If Servicer sends location -> emit "servicer-location-update" (for user to see)
        const isUser = socket.role === ROLES.USER;
        const eventName = isUser ? "user-location-update" : "servicer-location-update";

        // Broadcast to everyone ELSE in the room
        socket.to(room).emit(eventName, {
          bookingId,
          latitude: lat,
          longitude: lng,
          heading: head,
          eta: reachTime,
          updatedAt: new Date(),
          senderRole: socket.role
        });

        // PERSISTENCE: Update the database so page refreshes show latest status
        try {
          if (!isUser) {
            // Update the booking with latest ETA and Heading
            await Booking.findByIdAndUpdate(bookingId, {
              $set: {
                "location.heading": head,
                "location.eta": reachTime
              }
            });

            // Update servicer's current profile location (for dispatcher/nearby search)
            if (socket.employeeId) {
              await SingleEmployee.findByIdAndUpdate(socket.employeeId, {
                $set: { "location.coordinates": [lng, lat] }
              });
            } else if (socket.teamId) {
              await MultipleEmployee.findByIdAndUpdate(socket.teamId, {
                $set: { "location.coordinates": [lng, lat] }
              });
            }
          }
        } catch (dbErr) {
          console.error("[Socket] Failed to persist location update to DB:", dbErr.message);
        }

      } catch (err) {
        console.error("send-location error:", err.message);
      }
    });
    socket.on("visit-propose-service", async ({ bookingId, serviceCategoryId }) => {
      try {
        if (socket.role !== ROLES.SINGLE_EMPLOYEE) return;

        const booking = await Booking.findOne({
          _id: bookingId,
          visitMode: true,
          primaryEmployee: socket.employeeId,
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
          proposedBy: socket.employeeId,
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
    socket.on("visit-approve-service", async ({ bookingId, approve }) => {
      try {
        if (socket.role !== ROLES.USER) return;

        const booking = await Booking.findOne({
          _id: bookingId,
          user: socket.userId,
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

    socket.on("extra-service-propose", async ({ bookingId, serviceCategoryId }) => {
      try {
        if (socket.role !== ROLES.SINGLE_EMPLOYEE) return;
        await proposeExtraService({
          bookingId,
          serviceCategoryId,
          employeeId: socket.employeeId,
          io
        });
      } catch (err) {
        console.error("extra-service-propose error:", err.message);
        socket.emit("extra-service-error", { message: err.message });
      }
    });

    socket.on("extra-service-approve", async ({ bookingId, extraServiceId, approve }) => {
      try {
        console.log("Services");
        if (socket.role !== ROLES.USER) return;
        console.log("Extra Service");
        await approveExtraService({
          bookingId,
          extraServiceId,
          approve,
          userId: socket.userId,
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
    socket.on("team-assign-members", async ({ bookingId, primaryEmployee, helpers = [] }) => {
      try {
        if (socket.role !== ROLES.MULTIPLE_EMPLOYEE) return;
        const teamId = socket.teamId;
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
        booking.assignmentStatus = "ASSIGNED";
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
        if (socket.role !== ROLES.SINGLE_EMPLOYEE) return;
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
        if (socket.role !== ROLES.USER) return;
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
    socket.on("toolshop-accept", async ({ requestId }) => {
      try {
        if (socket.role !== ROLES.TOOL_SHOP) return;
        await toolshopAccept({ requestId, shopId: socket.shopId, io });
      } catch (err) {
        console.error("toolshop-accept error:", err);
      }
    });


    // ToolShop rejects request
    socket.on("toolshop-reject", async ({ requestId }) => {
      try {
        if (socket.role !== ROLES.TOOL_SHOP) return;
        await toolshopReject({ requestId, shopId: socket.shopId, io });
      } catch (err) {
        console.error("toolshop-reject error:", err);
      }
    });


    // Employee verifies OTP when collecting tool
    socket.on("verify-part-otp", async ({ requestId, otp }) => {
      try {
        if (!requestId || !otp) {
          console.log("Missing requestId or otp");
          socket.emit("otp-failed", { message: "Missing requestId or otp" });
          return;
        }
        const result = await verifyPartOTP(requestId, otp);

        if (!result.success) {
          console.log("not sucess");
          socket.emit("otp-failed", { message: "Invalid OTP" });
          return;
        }
        console.log("success");
        socket.emit("part-otp-success", {
          requestId,
        });

      } catch (err) {
        socket.emit("otp-failed", { message: err.message });
      }
    });

    socket.on("verify-start-otp", async ({ bookingId, otp }) => {
      console.log("📥 OTP verify request:", bookingId, otp);
      const booking = await Booking.findById(bookingId);
      console.log("🔎 Booking status:", booking.status);
      try {
        const result = await verifyStartOTP(bookingId, otp);
        if (!result.success) {
          console.log("❌ OTP FAILED (backend)");
          socket.emit("start-otp-failed", { message: "Invalid OTP" });
          return;
        }
        console.log("✅ OTP SUCCESS (backend)");
        socket.emit("otp-success", result);
      } catch (err) {
        console.log("💥 OTP ERROR:", err.message);
        socket.emit("otp-failed", { message: err.message });
      }
    });

    /* ===============================
       SUPPORT CHAT (TICKET BASED)
    =============================== */
    socket.on("join-ticket-chat", ({ ticketId }) => {
      if (!ticketId) return;
      const room = `ticket_${ticketId}`;
      socket.join(room);
      console.log(`[Socket] ${socket.id} (Role: ${socket.role}) joined support chat: ${room}`);
    });

    socket.on("send-ticket-chat-message", async ({ ticketId, message, type = "text" }) => {
      try {
        if (!ticketId || !message) return;

        const ticket = await Ticket.findById(ticketId);
        if (!ticket) return;

        const senderId = socket.userId || socket.employeeId || socket.adminId || socket.id;
        const senderModel = socket.role === ROLES.USER ? "User" :
          (socket.role === ROLES.SINGLE_EMPLOYEE ? "SingleEmployee" :
            (socket.role === ROLES.MULTIPLE_EMPLOYEE ? "MultipleEmployee" :
              (socket.role === ROLES.TOOL_SHOP ? "ToolShop" : "Admin")));

        // Persist message
        const newMsg = await TicketMessage.create({
          ticket: ticketId,
          sender: senderId,
          senderModel: senderModel,
          message,
          type
        });

        const room = `ticket_${ticketId}`;
        // Broadcast to everyone ELSE in the room
        socket.to(room).emit("receive-ticket-chat-message", {
          ticketId,
          message: newMsg,
          senderRole: socket.role
        });

      } catch (err) {
        console.error("send-ticket-chat-message error:", err.message);
      }
    });

    /* ===============================
       USER CANCEL
    =============================== */
    socket.on("user-cancel-booking", async ({ bookingId }) => {
      if (socket.role !== ROLES.USER) return;

      const booking = await Booking.findOneAndUpdate(
        { _id: bookingId, user: socket.userId },
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
