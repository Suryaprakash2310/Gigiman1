const mongoose = require("mongoose");
const crypto = require("crypto");
const  PAYMENT_STATUS  = require("../enum/payment.enum");
const  BOOKING_STATUS  = require("../enum/bookingstatus.enum");
const Booking = require("../models/Booking.model");
const SingleEmployee = require("../models/singleEmployee.model");
const User = require("../models/user.model");
const PartRequest = require('../models/partsrequest.model');
const Domainparts = require('../models/domainparts.model');
const {
  findNearbyTeams,
  createBooking,
  verifyStartOTP,
  requestTool,
  findNearbyToolShops,
  verifyPartOTP,
  assignNextTeam,
  assignNextToolshop,
  assignNextServicer,
} = require("../services/booking.service");
const AppError = require("../utils/AppError");
const Review = require("../models/review.model");
const { PART_REQUEST_STATUS } = require("../enum/partsstatus.enum");
const ROLES = require("../enum/role.enum");
/* ======================================================
   SEARCH NEARBY SERVICERS
====================================================== */
exports.searchNearbyservicer = async (req, res, next) => {
  try {
    const {
      address,
      coordinates,
      serviceCategoryName,
      serviceCount = 1,
    } = req.body;

    // Basic validation
    if (!serviceCategoryName) {
      return next(new AppError("serviceCategoryName is required", 400));
    }

    if (!address && !coordinates) {
      return next(new AppError("Either address or coordinates must be provided", 400));
    }

    const result = await findNearbyTeams({
      address,
      coordinates,
      serviceCategoryName,
      serviceCount,
    });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    next(err); //  Let global error middleware respond
  }
};

/* ======================================================
   AUTO ASSIGN SERVICER (NO TEMP ID)
====================================================== */
exports.autoAssignServicer = async (req, res, next) => {
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

    if (!serviceCategoryName) {
      return next(new AppError("serviceCategoryName is required", 400));
    }

    if (!address && !coordinates) {
      return next(
        new AppError("Either address or coordinates is required", 400)
      );
    }
    /* -------------------------
       Validate user + socket
    ------------------------- */
    const user = await User.findById(userId);
    if (!user || !user.socketId) {
      return next(new AppError("Invalid user or user not connected", 400));
    }

    /* ======================================================
        CREATE BOOKING (ALWAYS FIRST)
    ====================================================== */
    const { booking, serviceType, employeeCount } = await createBooking({
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

      return next(new AppError("No servicers available nearby", 404));
    }
    /* ======================================================
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
    next(err); //let Global error handler deal with it
  }
};

/* ======================================================
   TEAM ASSIGN MEMBERS
====================================================== */
exports.teamAssignMembers = async (req, res, next) => {
  try {
    const { bookingId, primaryEmployee, helpers = [] } = req.body;

    //  Fetch booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return next(new AppError("Booking not found", 404));
    }

    //  Validate booking state
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return next(new AppError("Team assignment not allowed in current booking state", 400));
    }

    if (booking.serviceType !== "team") {
      return next(new AppError("Not a team booking", 400));
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
    next(err); //let Global error handler deal with it
  }
};

exports.verifystartOTPcontroller = async (req, res, next) => {
  try {
    const { bookingId, otp } = req.body;

    const result = await verifyStartOTP(bookingId, otp);

    if (!result.success) {
      return next(new AppError("Invalid OTP", 400));
    }

    return res.status(200).json({
      success: true,
      booking: result.booking,
      message: "Work started successfully",
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


exports.requestToolController = async (req, res, next) => {
  try {
    const employeeId = req.employeeId;//  from employee middleware
    const { bookingId, parts = [], totalCost } = req.body;

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
        if (!name) throw new AppError("partsId or partName is required", 400);

        const domainPart = await Domainparts.findOne({ partName: name });
        if (!domainPart) throw new AppError(`Part not found: ${name}`, 404);
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
    next(err); //let Global error handler deal with it
  }
};

exports.approvePartRequest = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError("Only user can approve parts", 403));
    }

    const { requestId } = req.params;

    const partRequest = await PartRequest.findById(requestId);
    if (!partRequest) {
      return next(new AppError("Part request not found", 404));
    }

    //  Ensure booking belongs to this user
    const booking = await Booking.findOne({
      _id: partRequest.bookingId,
      user: req.user._id,
    }).populate('user');
    console.log(booking);
    if (!booking) {
      return next(new AppError("Unauthorized booking", 403));
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
    next(err); //let Global error handler deal with it
  }
};


exports.getPartRequestById = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    const partRequest = await PartRequest.findById(requestId)
      .populate("employeeId", "fullname phoneNo")
      .populate("bookingId", "address");

    if (!partRequest) {
      return next(new AppError("Part request not found", 404));
    }

    return res.status(200).json({
      success: true,
      partRequest,
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

/* ======================================================
   NEARBY TOOL SHOPS
====================================================== */
exports.nearbyToolShops = async (req, res, next) => {
  try {
    const { coordinates } = req.body;
    const shops = await findNearbyToolShops({ coordinates });

    return res.status(200).json({ success: true, shops });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

/* ======================================================
   AUTO ASSIGN TOOL SHOP
====================================================== */
exports.autoAssignToolShop = async (req, res, next) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return next(new AppError("requestId is required", 400));
    }
    const partRequest = await PartRequest.findById(requestId).populate("bookingId");
    if (!partRequest) {
      return next(new AppError("Part request not found", 404));
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
    next(err); //let Global error handler deal with it
  }
};


/* ======================================================
   VERIFY PART OTP
====================================================== */

exports.verifyPartOTPcontroller = async (req, res, next) => {
  try {
    const { requestId, otp } = req.body;

    if (!requestId || !otp) {
      return next(new AppError("requestId and otp are required", 400));
    }

    const io = req.app?.get("io") || null;

    const result = await verifyPartOTP(requestId, otp, io);

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    next(err); //  Let global error middleware respond
  }
};

exports.getBookingById = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate("primaryEmployee", "fullname phoneNo")
      .populate("employees", "fullname phoneNo");

    if (!booking) {
      return next(new AppError("Booking not found", 404));
    }

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};
/*================================================
   REVIEW
=================================================*/
exports.submitReview = async (req, res, next) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user._id;
    const booking = await Booking.findById(bookingId);
    if (!booking) return next(new AppError("Booking not found", 404));

    if (!booking.user.equals(userId)) {
      return next(new AppError("Not your booking", 403));
    }

    const existing = await Review.findOne({ booking: bookingId });
    if (existing) {
      return next(new AppError("Review already submitted for this booking", 400));
    }
    const review = await Review.create({
      booking: bookingId,
      user: userId,
      serviceType: booking.serviceType,
      primaryEmployee: booking.primaryEmployee,
      helpers: booking.employees || [],
      company: booking.employees || [],
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
    next(err); //let Global error handler deal with it
  }
}
/* ======================================================
   PAYMENT SUCCESS
====================================================== */
exports.paymentSuccess = async (req, res, next) => {
  try {
    const {
      bookingId,
      paymentMethod,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    } = req.body;

    if (!bookingId || !paymentMethod) {
      return next(new AppError("bookingId and paymentMethod are required", 400));
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return next(new AppError("Booking not found", 404));
    }

    // Prevent double payment
    if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
      return next(new AppError("Payment already completed for this booking", 400));
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
        return next(new AppError("Razorpay payment details are required", 400));
      }

      const body = razorpayOrderId + "|" + razorpayPaymentId;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpaySignature) {
        return next(new AppError("Invalid Razorpay signature", 400));
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

    return next(new AppError("Unsupported payment method", 400));

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.getUserRecentBookingHistory = async (req, res, next) => {
  try {
    const userId = req.userId;
    const bookings = await Booking.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("primaryEmployee", "empId fullname")
      .populate("employees", "storeName teamId")
      .populate("selectedToolshop", "toolShopId storeLocation")
    if (!bookings || bookings.length === 0) {
      next(new AppError("No bookings found", 404));
    }
    return res.status(200).json({
      bookings,
      total: bookings.length,
      success: true,
    })
  } catch (err) {
    next(err);
  }
}

exports.getEmployeeRecentBookingHistory = async (req, res, next) => {
  try {
    const { role, data } = req.employee;
    let filter = {};
    if (role === ROLES.SINGLE_EMPLOYEE) {
      filter.$or = [{ primaryEmployee: data._id }
        , { employees: data._id }];
    }
    else if (role === ROLES.MULTIPLE_EMPLOYEE) {
      filter.servicerCompany = data._id;
    }
    else if (role === ROLES.TOOL_SHOP) {
      filter.selectedToolshop = data._id;
    }
    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .populate("user", "fullname phoneMasked")
      .populate("primaryEmployee", "empId fullname")
      .populate("servicerCompany", "storeName TeamId")
      .populate("selectedToolshop", "toolShopId storeLocation");
    if (!bookings || bookings.length === 0) {
      return next(new AppError("No bookings found", 404));
    }
    return res.status(200).json({
      bookings,
      total: bookings.length,
      success: true,
    })
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
}


exports.getPopularBookings = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;

    const since = new Date();
    since.setDate(since.getDate() - Number(days));

    const popularBookings = await Booking.aggregate([
      {
        $match: {
          status: BOOKING_STATUS.COMPLETED,
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: "$serviceCategoryName",
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$totalPrice" },
        }
      },
      {
        $sort: {
          totalBookings: -1
        }
      },
      {
        $lookup: {
          from: "servicelists",
          let: { categoryName: "$_id" },
          pipeline: [
            { $unwind: "$serviceCategory" },
            {
              $match: {
                $expr: {
                  $eq: [
                    "$serviceCategory.serviceCategoryName",
                    "$$categoryName"
                  ]
                }
              }
            },
            {
              $project: {
                _id: 0,
                serviceName: 1,
                serviceCategoryName: "$serviceCategory.serviceCategoryName",
                serviceCategoryImage: "$serviceCategory.servicecategoryImage"
              }
            }
          ],
          as: "serviceInfo"
        }
      },
      {
        $unwind:{
          path:"$serviceInfo",
          preserveNullAndEmptyArrays:true
        }
      }
    ])
    return res.status(200).json({
      success: true,
      rangeDays: Number(days),
      totalServices: popularBookings.length,
      popularServices: popularBookings
    });


  } catch (err) {
    next(err); //let Global error handler deal with it
  }
}