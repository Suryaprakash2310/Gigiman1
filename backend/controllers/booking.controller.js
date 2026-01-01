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
    const { userId, serviceCategoryName, coordinates, address, serviceCount = 1 } = req.body;

    const user = await User.findById(userId);
    if (!user?.socketId) {
      return res.status(400).json({ message: "User socket not registered" });
    }

    const result = await findNearbyTeams({
      serviceCategoryName,
      coordinates,
      address,
      serviceCount,
    });

    if (!result.data?.length) {
      return res.status(404).json({ message: "No nearby servicers found" });
    }

    // Create booking FIRST
    const { booking } = await createBooking(req.body);
    const bookingId = booking._id.toString();

    if (result.type === "single") {
      startServicerQueue({
        bookingId,
        servicers: result.data.map(e => e._id),
        userSocket: user.socketId,
        io: req.io,
      });

      return res.status(200).json({
        message: "Single employee auto-assign started",
        bookingId,
      });
    }

    startTeamQueue({
      bookingId,
      teams: result.data.map(t => t._id),
      userSocket: user.socketId,
      io: req.io,
    });

    return res.status(200).json({
      message: "Team auto-assign started",
      bookingId,
    });

  } catch (err) {
    console.error("autoAssignServicer error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};
exports.createBookingFinal = async (req, res) => {
  try {
    const result = await createBooking(req.body);

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("createBookingFinal error:", err.message);
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
      return res.status(404).json({ message: "Booking not found" });
    }

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
    const { booking, otp } = await generateStartOTP(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.status(200).json({ success: true, booking, otp });
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
