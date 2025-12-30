const mongoose = require("mongoose");

const Booking = require("../models/Booking.model");
const SingleEmployee = require("../models/singleEmployee.model");
const User = require("../models/user.model");
const ToolShop = require("../models/toolshop.model");

const {
  findNearbyTeams,
  createBooking,
  generateStartOTP,
  verifyStartOTP,
  requestTool,
  startServicerQueue,
  startTeamQueue,
  findNearbyToolShops,
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
    const { address, coordinates, serviceCategoryName } = req.body;

    const result = await findNearbyTeams({
      address,
      coordinates,
      serviceCategoryName,
    });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("searchNearbyservicer ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ======================================================
   AUTO ASSIGN SERVICER (SINGLE / TEAM)
====================================================== */
exports.autoAssignServicer = async (req, res) => {
  try {
    const {
      userId,
      serviceCategoryName,
      coordinates,
      address,
      serviceCount = 1,
    } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.socketId) {
      return res.status(400).json({
        message: "User socket not registered",
      });
    }

    const result = await findNearbyTeams({
      serviceCategoryName,
      coordinates,
      address,
    });

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({
        message: "No nearby servicers found",
      });
    }

    // SAFE TEMP BOOKING ID
    const tempBookingId = new mongoose.Types.ObjectId().toString();

    // SINGLE AUTO ASSIGN
    if (result.type === "single") {
      startServicerQueue({
        bookingId: tempBookingId,
        servicers: result.data.map((e) => e._id),
        userSocket: user.socketId,
        io: req.io,
      });

      return res.status(200).json({
        message: "Single employee auto-assign started",
        bookingId: tempBookingId,
      });
    }

    // TEAM AUTO ASSIGN
    startTeamQueue({
      bookingId: tempBookingId,
      teams: result.data.map((t) => t._id),
      userSocket: user.socketId,
      io: req.io,
    });

    return res.status(200).json({
      message: "Team auto-assign started",
      bookingId: tempBookingId,
    });
  } catch (err) {
    console.error("autoAssignServicer ERROR:", err.message);
    return res.status(500).json({
      message: err.message,
    });
  }
};

/* ======================================================
   FINAL BOOKING CREATION
====================================================== */
exports.createBookingFinal = async (req, res) => {
  try {
    const {
      serviceCount = 1,
      serviceCategoryName,
    } = req.body;

    if (!serviceCategoryName) {
      return res.status(400).json({
        message: "serviceCategoryName is required",
      });
    }

    const result = await createBooking({
      ...req.body,
      serviceCount,
    });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("createBookingFinal ERROR:", err.message);
    return res.status(500).json({
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

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        primaryEmployee,
        employees: [primaryEmployee, ...helpers],
      },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Team assigned successfully",
      booking,
    });
  } catch (err) {
    console.error("teamAssignMembers ERROR:", err.message);
    return res.status(500).json({
      message: err.message,
    });
  }
};

/* ======================================================
   START WORK OTP
====================================================== */
exports.generateStartOtpcontroller = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const { booking, otp } = await generateStartOTP(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.status(200).json({
      success: true,
      booking,
      otp,
    });
  } catch (err) {
    console.error("generateStartOtp ERROR:", err.message);
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
    });
  } catch (err) {
    console.error("verifyStartOTP ERROR:", err.message);
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
    console.error("requestTool ERROR:", err.message);
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

    return res.status(200).json({
      success: true,
      shops,
    });
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
    if (!booking || !booking.employees.length) {
      return res.status(404).json({ message: "Invalid booking" });
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
      shops: shops.map((s) => s._id.toString()),
      employeeSocket: employee.socketId,
      io: req.io,
    });

    return res.status(200).json({
      success: true,
      message: "Toolshop auto-assign started",
    });
  } catch (err) {
    console.error("autoAssignToolShop ERROR:", err.message);
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
    console.error("verifyToolOTP ERROR:", err.message);
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

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("verifyPartOTP ERROR:", err.message);
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
