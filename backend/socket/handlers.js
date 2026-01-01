const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const PartRequest = require("../models/partsrequest.model");
const Booking = require("../models/Booking.model");

const {
  startServicerQueue,
  servicerAccept,
  servicerReject,

  startTeamQueue,
  teamAccept,
  teamReject,

  generateStartOTP,
  verifyStartOTP,

  requestTool,
  findNearbyToolShops,

  startToolShopQueue,
  toolshopAccept,
  toolshopReject,

  verifyToolOTP,
  verifyPartOTP,
} = require("../services/booking.service");

const BOOKING_STATUS = require("../enum/bookingstatus.enum");

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    /* ===============================
       REGISTER SOCKETS
    =============================== */
    socket.on("register-user", async ({ userId }) => {
      await User.findByIdAndUpdate(userId, { socketId: socket.id });
    });

    socket.on("register-employee", async ({ employeeId }) => {
      await SingleEmployee.findByIdAndUpdate(employeeId, {
        socketId: socket.id,
        isActive: true,
      });
    });

    socket.on("register-team", async ({ teamId }) => {
      await MultipleEmployee.findByIdAndUpdate(teamId, {
        socketId: socket.id,
        isActive: true,
      });
    });

    socket.on("register-toolshop", async ({ shopId }) => {
      await ToolShop.findByIdAndUpdate(shopId, { socketId: socket.id });
    });

    /* ===============================
       AUTO ASSIGN (SINGLE / TEAM)
       bookingId MUST be real
    =============================== */
    socket.on("start-auto-assign", async ({ bookingId, type, candidates }) => {
      const booking = await Booking.findById(bookingId);
      if (!booking) return;

      const user = await User.findById(booking.user);
      if (!user?.socketId) return;

      if (type === "single") {
        return startServicerQueue({
          bookingId,
          servicers: candidates,
          userSocket: user.socketId,
          io,
        });
      }

      if (type === "team") {
        return startTeamQueue({
          bookingId,
          teams: candidates,
          userSocket: user.socketId,
          io,
        });
      }
    });

    /* ===============================
       ACCEPT / REJECT
    =============================== */
    socket.on("servicer-accept", ({ bookingId, employeeId }) =>
      servicerAccept(bookingId, employeeId, io)
    );

    socket.on("servicer-reject", ({ bookingId }) =>
      servicerReject(bookingId, io)
    );

    socket.on("team-accept", ({ bookingId, teamId }) =>
      teamAccept(bookingId, teamId, io)
    );

    socket.on("team-reject", ({ bookingId }) =>
      teamReject(bookingId, io)
    );

    /* ===============================
       TEAM ASSIGN MEMBERS
    =============================== */
    socket.on("team-assign-members", async ({ bookingId, primaryEmployee, helpers = [] }) => {
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          primaryEmployee,
          employees: [primaryEmployee, ...helpers],
        },
        { new: true }
      );
      if (!booking) return;

      const user = await User.findById(booking.user);
      user?.socketId &&
        io.to(user.socketId).emit("team-assigned", booking);

      const employees = await SingleEmployee.find({
        _id: { $in: booking.employees },
      });

      employees.forEach(emp => {
        emp.socketId &&
          io.to(emp.socketId).emit("team-member-assigned", booking);
      });
    });

    /* ===============================
       START WORK OTP
    =============================== */
    socket.on("generate-start-otp", async ({ bookingId }) => {
      const { booking, otp } = await generateStartOTP(bookingId);
      if (!booking) return;

      const user = await User.findById(booking.user);
      user?.socketId &&
        io.to(user.socketId).emit("start-work-otp", otp);
    });

    socket.on("verify-start-otp", async ({ bookingId, otp }) => {
      const result = await verifyStartOTP(bookingId, otp);
      if (!result.success) {
        return socket.emit("otp-failed");
      }

      const booking = result.booking;
      const employees = await SingleEmployee.find({
        _id: { $in: booking.employees },
      });

      employees.forEach(emp => {
        emp.socketId &&
          io.to(emp.socketId).emit("otp-success", booking);
      });
    });

    /* ===============================
       TOOL REQUEST FLOW
    =============================== */
    socket.on("tool-request", async ({ bookingId, toolName }) => {
      const booking = await requestTool(bookingId, toolName);
      const user = await User.findById(booking.user);

      user?.socketId &&
        io.to(user.socketId).emit("tool-permission-request", booking);
    });

    socket.on("tool-permission-approved", async ({ bookingId, coordinates }) => {
      const shops = await findNearbyToolShops({ coordinates });
      if (!shops.length) return;

      startToolShopQueue({
        requestId: bookingId,
        shops: shops.map(s => s._id.toString()),
        employeeSocket: socket.id,
        io,
      });
    });

    socket.on("toolshop-accept", ({ requestId, shopId }) =>
      toolshopAccept(requestId, shopId, io)
    );

    socket.on("toolshop-reject", ({ requestId }) =>
      toolshopReject(requestId, io)
    );

    socket.on("verify-tool-otp", async ({ bookingId, otp }) => {
      const result = await verifyToolOTP(bookingId, otp);
      if (!result.success) {
        return socket.emit("otp-failed");
      }

      socket.emit("tool-otp-success", result.booking);
    });

    /* ===============================
       PART REQUEST FLOW
    =============================== */
    socket.on("parts-request", async (data) => {
      const req = await PartRequest.create(data);
      const booking = await Booking.findById(data.bookingId);
      const user = await User.findById(booking.user);

      user?.socketId &&
        io.to(user.socketId).emit("parts-approval-request", req);
    });

    socket.on("verify-part-otp", async ({ requestId, otp }) => {
      const result = await verifyPartOTP(requestId, otp);
      if (!result.success) {
        return socket.emit("otp-failed");
      }

      socket.emit("part-otp-success", result);
    });

    /* ===============================
       USER CANCEL
    =============================== */
    socket.on("user-cancel-booking", async ({ bookingId }) => {
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        { status: BOOKING_STATUS.CANCELLED },
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
        { socketId: null, isActive: false }
      );
      await MultipleEmployee.updateOne(
        { socketId: socket.id },
        { socketId: null, isActive: false }
      );
      await ToolShop.updateOne({ socketId: socket.id }, { socketId: null });
    });
  });
};
