const mongoose = require("mongoose");

const Booking = require("../models/Booking.model");
const SingleEmployee = require("../models/singleEmployee.model");
const User = require("../models/user.model");

const {
  findNearbyTeams,
  createBooking,
  generateStartOTP,
  verifyStartOTP,
  requestTool,
  findNearbyToolShops,
  startServicerQueue,
  startTeamQueue,
  startToolShopQueue,
  verifyToolOTP,
  verifyPartOTP,
} = require("../services/booking.service");

const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const PAYMENT_STATUS = require("../enum/payment.enum");

/* ======================================================
   SEARCH NEARBY SERVICERS
====================================================== */
exports.searchNearbyservicer = async (req, res) => {
  try {
    const { address, coordinates, serviceCategoryName, serviceCount = 1 } = req.body;

    const result = await findNearbyTeams({
      address,
      coordinates,
      serviceCategoryName,
      serviceCount,
    });

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("searchNearbyservicer error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   AUTO ASSIGN SERVICER (NO TEMP ID)
====================================================== */
exports.autoAssignServicer = async (req, res) => {
  try {
    const {
      userId,
      serviceCategoryName,
      domainService,
      address,
      coordinates,
      serviceCount = 1,
    } = req.body;

    /* -------------------------
       Validate user + socket
    ------------------------- */
    const user = await User.findById(userId);
    if (!user || !user.socketId) {
      return res.status(400).json({
        success: false,
        message: "User socket not registered",
      });
    }

    /* ======================================================
        CREATE BOOKING (ALWAYS FIRST)
    ====================================================== */
    const { booking, serviceType } = await createBooking({
      userId,
      serviceCategoryName,
      domainService,
      address,
      coordinates,
      serviceCount,
    });

    /* ======================================================
        FIND NEARBY SERVICERS / TEAMS
    ====================================================== */
    const result = await findNearbyTeams({
      serviceCategoryName,
      address,
      coordinates,
      serviceCount,
    });

    /* -------------------------
       No servicers available
    ------------------------- */
    if (!result.data || result.data.length === 0) {
      await Booking.findByIdAndUpdate(booking._id, {
        status: BOOKING_STATUS.NO_PROVIDER,
      });

      return res.status(404).json({
        success: false,
        message: "No servicers available at the moment",
        bookingId: booking._id,
      });
    }

    /* ======================================================
        START AUTO-ASSIGN QUEUE
    ====================================================== */
    if (result.type === "single") {
      startServicerQueue({
        bookingId: booking._id.toString(),
        servicers: result.data.map(e => e._id),
        userSocket: user.socketId,
        io: req.io,
      });
    } else {
      startTeamQueue({
        bookingId: booking._id.toString(),
        teams: result.data.map(t => t._id),
        userSocket: user.socketId,
        io: req.io,
      });
    }

    /* -------------------------
       Success response
    ------------------------- */
    return res.status(200).json({
      success: true,
      bookingId: booking._id,
      assignType: result.type,
      message: "Booking created and auto-assign started",
    });

  } catch (err) {
    console.error("autoAssignServicer error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ======================================================
   TEAM ASSIGN MEMBERS
====================================================== */
exports.teamAssignMembers = async (req, res) => {
  try {
    const { bookingId, primaryEmployee, helpers = [] } = req.body;

    //  Fetch booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    //  Validate booking state
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return res.status(400).json({
        message: "Team assignment not allowed in current booking state",
      });
    }

    if (booking.serviceType !== "team") {
      return res.status(400).json({
        message: "Not a team booking",
      });
    }

    //  Assign team members atomically
    booking.primaryEmployee = primaryEmployee;
    booking.employees = [primaryEmployee, ...helpers];
    await booking.save();

    //  Mark all assigned employees BUSY
    await SingleEmployee.updateMany(
      { _id: { $in: [primaryEmployee, ...helpers] } },
      { availabilityStatus: "BUSY" }
    );

    return res.status(200).json({
      success: true,
      message: "Team assigned successfully",
      booking,
    });

  } catch (err) {
    console.error("teamAssignMembers error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};


/* ======================================================
   START WORK OTP
====================================================== */
exports.generateStartOtpcontroller = async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.primaryEmployee) {
      return res.status(400).json({
        message: "Cannot generate OTP before employee assignment",
      });
    }

    const { booking: updatedBooking, otp } =
      await generateStartOTP(bookingId);

    return res.status(200).json({
      success: true,
      booking: updatedBooking,
      otp,
    });

  } catch (err) {
    console.error("generateStartOtp error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

exports.verifystartOTPcontroller = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;

    const result = await verifyStartOTP(bookingId, otp);

    if (!result.success) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    return res.status(200).json({
      success: true,
      booking: result.booking,
      message: "Work started successfully",
    });

  } catch (err) {
    console.error("verifyStartOtp error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   TOOL REQUEST
====================================================== */
exports.requestToolController = async (req, res) => {
  try {
    const { bookingId, toolName } = req.body;
    const booking = await requestTool(bookingId, toolName);

    return res.status(200).json({
      success: true,
      message: "Tool request sent",
      booking,
    });
  } catch (err) {
    console.error("requestTool error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   NEARBY TOOL SHOPS
====================================================== */
exports.nearbyToolShops = async (req, res) => {
  try {
    const { coordinates } = req.body;
    const shops = await findNearbyToolShops({ coordinates });

    return res.status(200).json({ success: true, shops });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   AUTO ASSIGN TOOL SHOP
====================================================== */
exports.autoAssignToolShop = async (req, res) => {
  try {
    const { bookingId, coordinates } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking?.employees?.length) {
      return res.status(400).json({ message: "Invalid booking" });
    }

    const employee = await SingleEmployee.findById(booking.employees[0]);
    if (!employee?.socketId) {
      return res.status(400).json({ message: "Employee socket not found" });
    }

    const shops = await findNearbyToolShops({ coordinates });
    if (!shops.length) {
      return res.status(404).json({ message: "No toolshops found" });
    }

    startToolShopQueue({
      requestId: bookingId,
      shops: shops.map(s => s._id.toString()),
      employeeSocket: employee.socketId,
      io: req.io,
    });

    return res.status(200).json({
      success: true,
      message: "Toolshop auto-assign started",
    });
  } catch (err) {
    console.error("autoAssignToolShop error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   VERIFY TOOL OTP
====================================================== */
exports.verifyToolOTPcontroller = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;
    const result = await verifyToolOTP(bookingId, otp);

    if (!result.success) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    return res.status(200).json({
      success: true,
      booking: result.booking,
    });
  } catch (err) {
    console.error("verifyToolOtp error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   VERIFY PART OTP
====================================================== */
exports.verifyPartOTPcontroller = async (req, res) => {
  try {
    const { requestId, otp } = req.body;
    const result = await verifyPartOTP(requestId, otp);

    if (!result.success) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("verifyPartOtp error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   PAYMENT SUCCESS
====================================================== */
exports.paymentSuccess = async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.paymentStatus = PAYMENT_STATUS.PAID;
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      booking,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
