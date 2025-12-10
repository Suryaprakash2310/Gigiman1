const Booking = require("../models/Booking.model");
const SingleEmployee = require("../models/singleEmployee.model");
const User = require("../models/user.model");
const ToolShop = require("../models/toolshop.model");

const { findNearbyTeams, createBooking, generateStartOTP, verifyStartOTP, requestTool, startServicerQueue, startTeamQueue, findNearbyToolShops, startToolShopQueue, verifyPartOTP } = require("../services/booking.service");

exports.searchNearbyservicer = async (req, res) => {
  try {
    const { address, coordinates, servicerCategoryName } = req.body;
    const result = await findNearbyTeams({
      address,
      coordinates,
      servicerCategoryName
    });
    res.status(200).json({
      success: true,
      result,
    });
  }
  catch (err) {
    console.error("searchnearbyservicer controller error", err.message);
    res.status(500).json({ message: "server error", error: err.message });
  }
}
exports.autoAssignServicer = async (req, res) => {
  try {
    const { userId, serviceCategoryName, coordinates, address } = req.body;

    // 1. Get user socket ID
    const user = await User.findById(userId);
    if (!user || !user.socketId) {
      return res.status(400).json({ message: "User socket not registered" });
    }

    // 2. Find nearby single employees or teams
    const result = await findNearbyTeams({
      serviceCategoryName,
      coordinates,
      address
    });

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ message: "No nearby servicers found" });
    }

    // TEMP booking ID (random)
    const tempBookingId = "B" + Date.now();

    // 3. Assign SINGLE EMPLOYEE
    if (result.type === "single") {
      startServicerQueue({
        bookingId: tempBookingId,
        servicers: result.data.map(e => e._id),
        userSocket: user.socketId,
        io: req.io
      });

      return res.status(200).json({
        message: "Single employee auto-assign started",
        bookingId: tempBookingId
      });
    }

    // 4. Assign TEAM
    startTeamQueue({
      bookingId: tempBookingId,
      teams: result.data.map(t => t._id),
      userSocket: user.socketId,
      io: req.io
    });

    return res.status(200).json({
      message: "Team auto-assign started",
      bookingId: tempBookingId
    });

  } catch (err) {
    console.error("autoAssignServicer ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};


exports.createBookingFinal = async (req, res) => {
  try {
    const result = await createBooking(req.body);
    res.status(200).json(
      {
        success: true,
        result,
      }
    );
  }
  catch (err) {
    res.status(500).json({ message: "server error", error: err.message });
    console.error("createbooking error", err.message);
  }
}

exports.teamAssignMembers = async (req, res) => {
  try {
    const { bookingId, primaryEmployee, helpers } = req.body;

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        primaryEmployee,
        employees: [primaryEmployee, ...helpers]
      },
      { new: true }
    )
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.status(200).json({
      success: true,
      message: "Team assigned",
      booking
    });
  }
  catch (err) {
    console.error("team Assignmembers controller error", err.message);
    res.status(500).json({ message: 'server error', error: err.message });
  }
}

exports.generateStartOtpcontroller = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const { booking, otp } = await generateStartOTP(bookingId);

    res.status(200).json({ booking, otp });
  }
  catch (err) {
    console.error("generate start otp controller", err.message);
    res.status(500).json({ message: "server error", error: err.message });
  }
}

exports.verifystartOTPcontroller = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;
    const result = await verifyStartOTP(bookingId, otp);
    if (!result.success) return res.status(400).json({ message: "Invalid OTP" });
  }
  catch (err) {
    console.error("verify start otp controller error", err.message);
    res.status(500).json({ message: "server error", error: err.message });
  }
}

exports.requestToolController = async (req, res) => {
  try {
    const { bookingId, toolName } = req.body;
    const booking = await requestTool(bookingId, toolName);
    res.status(200).json({ message: "Tool permission request", booking });
  }
  catch (err) {
    console.error("request tool controller error", err.message);
    res.status(500).json({ message: "server error", error: err.message });
  }
}

exports.nearbyToolShops = async (req, res) => {
  try {
    const { coordinates } = req.body;
    const shops = await findNearbyToolShops({ coordinates });
    res.json(shops);
  }
  catch (err) {
    res.status(500).json({ message: "server error", error: err.message });
  }
}
exports.autoAssignToolShop = async (req, res) => {
  try {
    const { bookingId, coordinates, employeeSocket } = req.body;

    // 1. Find tool shops near employee
    const shops = await findNearbyToolShops({ coordinates });

    if (!shops || shops.length === 0) {
      return res.status(404).json({ message: "No toolshops found" });
    }

    const shopIds = shops.map(s => s._id.toString());

    // 2. Start auto-assign queue for toolshops
    startToolShopQueue({
      requestId: bookingId,
      shops: shopIds,
      employeeSocket,
      io: req.io
    });

    res.status(200).json({
      success: true,
      message: "Toolshop auto-assign started",
      bookingId,
      shops
    });

  } catch (err) {
    console.error("autoAssignToolShop ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.generateToolOTPcontroller = async (req, res) => {
  try {
    const { bookingId, shopId } = req.body;
    const { booking, otp } = await generateToolOTP(bookingId, shopId);

    res.status(200).json({
      message: "otp is send successfully",
      booking,
      otp,
    })
  }
  catch (err) {
    console.error("generate tool otp error", err.message);
    res.status(500).json({ message: "server error", error: err.message });
  }
}

exports.verifyToolOTPcontroller = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;
    const result = await verifyPartOTP(bookingId, otp);
    if (!result.success) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    res.status(200).json({message:"otp is verified",result});
  }
  catch(err){
    console.error("verifyotp error",err.message);
    res.status(500).json({message:"server error",error:err.message});
  }
}

exports.paymentSuccess = async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.paymentStatus = "paid";
    await booking.save();

    res.json({ message: "Payment recorded", booking });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};