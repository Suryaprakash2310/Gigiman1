const mongoose = require("mongoose");

const Booking = require("../models/Booking.model");
const SingleEmployee = require("../models/singleEmployee.model");
const User = require("../models/user.model");
const PartRequest = require('../models/partsrequest.model');
const Domainparts = require('../models/domainparts.model');
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
  assignNextTeam,
  assignNextToolshop,
  assignNextServicer,
} = require("../services/booking.service");

const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const PAYMENT_STATUS = require("../enum/payment.enum");
const PART_REQUEST_STATUS = require("../enum/partsstatus.enum");
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
    const io = req.app.get("io");
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
    /* =======f===============================================
        START AUTO-ASSIGN QUEUE
    ====================================================== */
    if (result.type === "single") {
      assignNextServicer({
        bookingId: booking._id.toString(),
        coordinates: result.coordinates,
        io,
      });

    } else {
      assignNextTeam({
        bookingId: booking._id.toString(),
        coordinates: result.coordinates,
        employeeCount: result.employeeCount,
        io: io,
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
// exports.requestToolController = async (req, res) => {
//   try {
//     const { bookingId, toolName } = req.body;
//     const booking = await requestTool(bookingId, toolName);

//     return res.status(200).json({
//       success: true,
//       message: "Tool request sent",
//       booking,
//     });
//   } catch (err) {
//     console.error("requestTool error:", err.message);
//     return res.status(500).json({ message: err.message });
//   }
// };

exports.requestToolController = async (req, res) => {
  try {
    const employeeId = req.employeeId;// ✅ from employee middleware
    const { bookingId, parts = [], totalCost } = req.body;
    console.log("REQUEST BODY:", req.body);

    const io = (req.app && req.app.get && req.app.get("io")) || req.io || null;

    // Resolve partsId: accept provided `partsId` or lookup by part name
    const resolvedParts = await Promise.all(
      parts.map(async (p) => {
        let providedId = p.partsId || p.partId || p._id;
        if (providedId) {
          if (typeof providedId === "string") {
            const match = providedId.match(/[0-9a-fA-F]{24}/);
            if (match) {
              providedId = match[0];
            } else if (!mongoose.Types.ObjectId.isValid(providedId)) {
              throw new Error(`Invalid partsId: ${providedId}`);
            }
          }
          return {
            partsId: providedId,
            partName: p.partsname || p.partName || "",
            quantity: p.quantity,
            price: p.price,
          };
        }

        const name = p.partsname || p.partName;
        if (!name) throw new Error("partsId or partName is required for each part");

        const domainPart = await Domainparts.findOne({ partName: name });
        if (!domainPart) throw new Error(`Domain part not found: ${name}`);

        return {
          partsId: domainPart._id,
          partName: domainPart.partName,
          quantity: p.quantity,
          price: p.price != null ? p.price : domainPart.price,
        };
      })
    );

    // Compute total cost if not provided
    const computedTotalCost =
      totalCost != null
        ? totalCost
        : resolvedParts.reduce((sum, r) => sum + (r.price || 0) * (r.quantity || 0), 0);

    const partRequest = await requestTool({
      bookingId,
      employeeId,
      parts: resolvedParts,
      totalCost: computedTotalCost,
      status: PART_REQUEST_STATUS.PENDING,
      approvalByUser: false,
      io,
    });
    // 🔔 notify user (if socket server available)
    if (io) {
      io.to(`booking_${bookingId}`).emit("part-request-created", {
        requestId: partRequest._id,
        totalCost,
      });
    }

    return res.status(201).json({
      success: true,
      request: partRequest,
    });

  } catch (err) {
    console.error("requestTool error:", err.message);
    res.status(500).json({ message: err.message });
  }
};




// controllers/partApproval.controller.js
exports.approvePartRequest = async (req, res) => {
  try {
    console.log("approvePartRequest called with params:", req.params);
    if (!req.user) {
      return res.status(403).json({ message: "Only user can approve parts" });
    }

    const { requestId } = req.params;

    const partRequest = await PartRequest.findById(requestId);
    if (!partRequest) {
      return res.status(404).json({ message: "Part request not found" });
    }

    // 🔒 Ensure booking belongs to this user
    const booking = await Booking.findOne({
      _id: partRequest.bookingId,
      user: req.user._id,
    }).populate('user');
    console.log(booking);
    if (!booking) {
      return res.status(403).json({ message: "Unauthorized booking" });
    }

    // ✅ Approve
    partRequest.approvalByUser = true;
    partRequest.status = "APPROVED_BY_USER";
    await partRequest.save();

    // 🔔 Notify employee
    const notifyIo = (req.app && req.app.get && req.app.get("io")) || req.io || null;
    if (notifyIo) {
      notifyIo.to(`employee_${partRequest.employeeId}`).emit("tool-permission-approved", {
        requestId: partRequest._id,
        bookingId: partRequest.bookingId,
      });
    }

    res.status(200).json({
      success: true,
      message: "Parts approved",
    });
  } catch (err) {
    console.error("approvePartRequest:", err);
    res.status(500).json({ message: err.message });
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
    const { requestId } = req.body;

    const partRequest = await PartRequest.findById(requestId).populate("bookingId");
    if (!partRequest) {
      return res.status(404).json({ message: "Part request not found" });
    }

    const assignIo = (req.app && req.app.get && req.app.get("io")) || req.io || null;
    await assignNextToolshop({
      requestId,
      coordinates: partRequest.bookingId.location.coordinates,
      io: assignIo,
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

//* ======================================================
//   GENERATE TOOL OTP        
//* ======================================================    

exports.generateToolOTPController = async (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ message: "requestId is required" });
    }

    const genIo = (req.app && req.app.get && req.app.get("io")) || req.io || null;
    const result = await generateToolOTP(requestId, genIo);

    return res.status(200).json({
      success: true,
      message: "OTP generated successfully",
      data: result,
    });

  } catch (err) {
    console.error("generateToolOTP error:", err.message);
    return res.status(400).json({
      success: false,
      message: err.message,
    });
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
exports.getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate("primaryEmployee", "fullname phoneNo")
      .populate("employees", "fullname phoneNo");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (err) {
    console.error("getBookingById error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
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
