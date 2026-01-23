const mongoose = require("mongoose");
const crypto = require("crypto");
const{PAYMENT_STATUS}=require("../enum/payment.enum"); 
const{BOOKING_STATUS}=require("../enum/bookingstatus.enum");
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
const role = require("../utils/roleModelMap")
// const BOOKING_STATUS = require("../enum/bookingstatus.enum");
// const PAYMENT_STATUS = require("../enum/payment.enum");
const PART_REQUEST_STATUS = require("../enum/partsstatus.enum");

const Review = require("../models/review.model");
const ROLES = require("../enum/role.enum");
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

// exports.teamAssignMembers = async (req, res) => {
//   try {
//     const loggedInEmp = req.employee;
//     const { bookingId, primaryEmployee, helpers = [] } = req.body;

//     if (loggedInEmp.role !== "multi_employee") {
//       return res.status(403).json({ message: "Unauthorized" });
//     }

//     const booking = await Booking.findOne({
//       _id: bookingId,
//       serviceType: "team",
//       status: BOOKING_STATUS.PENDING,
//       servicerCompany: loggedInEmp._id,
//     });

//     if (!booking) {
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     const team = await MultipleEmployee.findById(loggedInEmp._id);

//     if (!team) {
//       return res.status(404).json({ message: "Team not found" });
//     }

//     // validate primary
//     if (!team.members.includes(primaryEmployee)) {
//       return res.status(400).json({ message: "Primary not in team" });
//     }

//     // validate helpers
//     for (const h of helpers) {
//       if (!team.members.includes(h)) {
//         return res.status(400).json({ message: "Helper not in team" });
//       }
//     }

//     if (helpers.length + 1 !== booking.employeeCount) {
//       return res.status(400).json({
//         message: `Requires ${booking.employeeCount} employees`
//       });
//     }

//     booking.primaryEmployee = primaryEmployee;
//     booking.employees = [primaryEmployee, ...helpers];
//     await booking.save();

//     await SingleEmployee.updateMany(
//       { _id: { $in: booking.employees } },
//       { availabilityStatus: "BUSY" }
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Booking assigned successfully",
//       booking,
//     });

//   } catch (err) {
//     console.error("assignTeamToBooking error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };


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

    //  Ensure booking belongs to this user
    const booking = await Booking.findOne({
      _id: partRequest.bookingId,
      user: req.user._id,
    }).populate('user');
    console.log(booking);
    if (!booking) {
      return res.status(403).json({ message: "Unauthorized booking" });
    }

    //  Approve
    partRequest.approvalByUser = true;
    partRequest.status = "WAITING_TOOLSHOP";
    await partRequest.save();

    await assignNextToolshop({
      requestId,
      coordinates: booking.location.coordinates,
      io: req.app.get("io"),
    });

    res.status(200).json({
      success: true,
      message: "Parts approved",
    });
  } catch (err) {
    console.error("approvePartRequest:", err);
    res.status(500).json({ message: err.message });
  }
};


exports.getPartRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    const partRequest = await PartRequest.findById(requestId)
      .populate("employeeId", "fullname phoneNo")
      .populate("bookingId", "address");

    if (!partRequest) {
      return res.status(404).json({
        success: false,
        message: "Part request not found",
      });
    }

    return res.status(200).json({
      success: true,
      partRequest,
    });
  } catch (err) {
    console.error("getPartRequestById error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
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
    console.log("autoAssignToolShop called with requestId:", requestId);

    if (!requestId) {
      return res.status(400).json({ message: "requestId is required" });
    }
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
    
     const io = (req.app && req.app.get && req.app.get("io")) || req.io || null;
    const result = await verifyPartOTP(requestId, otp, io);

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
/*================================================
   REVIEW
=================================================*/
exports.submitReview = async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user._id;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(400).json({ message: "Booking not found" });

    if (!booking.user.equals(userId)) {
      return res.status(403).json({ message: "Not your booking" });
    }

    const existing = await Review.findOne({ booking: bookingId });
    if (existing) {
      return res.status(400).json({ message: "Review already submitted for this booking" });
    }
    const review=await Review.create({
      booking: bookingId,
      user:userId,
      serviceType:booking.serviceType,
      primaryEmployee:booking.primaryEmployee,
      helpers:booking.employees||[],
      company:booking.employees||[],
      rating,
      comment
    })
    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review,
    });
  }
  catch (err) {
    console.error("submitReview error:", err.message);
    return res.status(500).json({ message: err.message });
  }
}
/* ======================================================
   PAYMENT SUCCESS
====================================================== */
exports.paymentSuccess = async (req, res) => {
  try {
    const {
      bookingId,
      paymentMethod,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    } = req.body;

    if (!bookingId || !paymentMethod) {
      return res.status(400).json({
        message: "bookingId and paymentMethod are required"
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Prevent double payment
    if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
      return res.status(409).json({
        message: "Booking already paid"
      });
    }

    /* ---------------- CASH FLOW ---------------- */
    if (paymentMethod === "CASH") {
      booking.paymentMethod = "CASH";
      booking.paymentStatus = PAYMENT_STATUS.PAID;
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.completedAt = new Date();

      await booking.save();

      return res.status(200).json({
        success: true,
        message: "Cash payment recorded and booking completed",
        booking
      });
    }

    /* ------------- RAZORPAY FLOW -------------- */
    if (paymentMethod === "RAZORPAY") {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({
          message: "Missing Razorpay payment details"
        });
      }

      const body = razorpayOrderId + "|" + razorpayPaymentId;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({
          message: "Invalid Razorpay signature"
        });
      }

      booking.paymentMethod = "RAZORPAY";
      booking.razorpayOrderId = razorpayOrderId;
      booking.razorpayPaymentId = razorpayPaymentId;
      booking.razorpaySignature = razorpaySignature;

      booking.paymentStatus = PAYMENT_STATUS.PAID;
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.completedAt = new Date();

      await booking.save();

      return res.status(200).json({
        success: true,
        message: "Online payment verified and booking completed",
        booking
      });
    }

    return res.status(400).json({
      message: "Invalid payment method"
    });

  } catch (err) {
    console.error("completeBooking error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};


