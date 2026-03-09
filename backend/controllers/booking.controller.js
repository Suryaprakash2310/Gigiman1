const mongoose = require("mongoose");
const crypto = require("crypto");
const PAYMENT_STATUS = require("../enum/payment.enum");
const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const Booking = require("../models/Booking.model");
const SingleEmployee = require("../models/singleEmployee.model");
const User = require("../models/user.model");
const PartRequest = require('../models/partsrequest.model');
const Domainparts = require('../models/domainparts.model');
const DomainService = require("../models/domainservice.model")
const ServiceList = require("../models/serviceList.model");
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
  resetAvailability,
  approveExtraService,
  proposeExtraService,
} = require("../services/booking.service");
const AppError = require("../utils/AppError");
const Review = require("../models/review.model");
const PART_REQUEST_STATUS = require("../enum/partsstatus.enum");
const ROLES = require("../enum/role.enum");
const PAYMENT_METHOD = require("../enum/paymentmethod.enum");
const { verifyPayment, createOrder } = require("../transaction/razorpay.config");
const BOOKING_TYPE = require("../enum/bookingtype.enum");
/* ======================================================
   SEARCH NEARBY SERVICERS
====================================================== */
exports.searchNearbyservicer = async (req, res, next) => {
  try {
    const {
      address,
      addressTitle,
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

    let parsedCoordinates = coordinates;
    if (Array.isArray(coordinates)) {
      parsedCoordinates = [parseFloat(coordinates[0]), parseFloat(coordinates[1])];
    }

    const result = await findNearbyTeams({
      address,
      addressTitle,
      coordinates: parsedCoordinates,
      serviceCategoryName,
      serviceCount,
    });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (err) {
    next(err); // Let global error middleware respond
  }
};

/* ======================================================
   AUTO ASSIGN SERVICER (NO TEMP ID)
====================================================== */
exports.autoAssignServicer = async (req, res, next) => {
  try {
    const {
      serviceCategoryName,
      address,
      addressTitle,
      coordinates,
      serviceCount = 1,
    } = req.body;

    let parsedCoordinates = coordinates;
    if (Array.isArray(coordinates)) {
      parsedCoordinates = [parseFloat(coordinates[0]), parseFloat(coordinates[1])];
    }
    const io = req.app.get("io");
    const userId = req.userId;
    console.log("autoAssignServicer called with:", {
      userId,
      serviceCategoryName,
      address,
      coordinates,
      serviceCount
    });
    if (!serviceCategoryName) {
      return next(new AppError("serviceCategoryName is required", 400));
    }
    if (!address && !coordinates) {
      return next(
        new AppError("Either address or coordinates is required", 400)
      );
    }
    const serviceList = await ServiceList.findOne({
      "serviceCategory.serviceCategoryName": serviceCategoryName,
    });

    if (!serviceList) {
      throw new AppError("Service Category not found", 404);
    }


    const category = serviceList.serviceCategory.find(
      c => c.serviceCategoryName === serviceCategoryName
    );

    if (!category) throw new AppError("Invalid service category", 400);

    const domainServiceId = serviceList.DomainServiceId;
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
    const { booking } = await createBooking({
      userId,
      serviceCategoryName,
      domainService: domainServiceId,
      address,
      addressTitle,
      coordinates: parsedCoordinates,
      serviceCount,
    });

    /* ======================================================
        FIND NEARBY SERVICERS / TEAMS
    ====================================================== */
    const result = await findNearbyTeams({
      serviceCategoryName,
      address,
      addressTitle,
      coordinates: parsedCoordinates,
      serviceCount,
    });
    console.log(result);
    /* -------------------------
       No servicers available
    ------------------------- */
    if (!result || result.length === 0) {
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
    if (!bookingId || !otp) {
      return next(new AppError("bookingId and otp are required", 400));
    }
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

    if (!bookingId) {
      return next(new AppError("bookingId is required", 400));
    }

    const booking = await Booking.findById(bookingId)
      .populate("servicerCompany", "fullName")
      .populate("primaryEmployee", "fullname phoneno rating");

    if (!booking) {
      return next(new AppError("Booking not found", 404));
    }

    const review = await Review.findOne({ booking: bookingId })
      .select("rating comment createdAt");

    return res.status(200).json({
      success: true,
      booking: {
        _id: booking._id,
        name: booking.servicerCompany?.fullName || booking.primaryEmployee?.fullname,
        serviceCategoryName: booking.serviceCategoryName,
        cost: booking.totalPrice,
        durationInMinutes: booking.durationInMinutes,
        employeeCount: String(booking.employeeCount || 1),
        address: booking.address,
        status: booking.status,
        otp: booking.otp,
        domainServiceId: booking.domainService?._id,
        technician: {
          name: booking.primaryEmployee?.fullname,
          rating: booking.primaryEmployee?.rating
        },
        coordinates: booking.coordinates,
      },
      review: review || null
    });

  } catch (err) {
    next(err);
  }
}
/*================================================
   REVIEW
=================================================*/
exports.submitReview = async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    const { bookingId } = req.params;

    if (!bookingId) {
      return next(new AppError("bookingId is required", 400));
    }
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
      company: booking.servicerCompany || null,
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

exports.createOrderController = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return next(new AppError("bookingId is required", 400));
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return next(new AppError("Booking not found", 404));
    }

    if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
      return next(new AppError("Already paid", 400));
    }

    const order = await createOrder(bookingId, booking.totalPrice);

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (err) {
    next(err);
  }
};


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

    const booking = await Booking.findById(bookingId).populate("user");
    const io = req.app?.get("io") || null;

    if (!booking) {
      return next(new AppError("Booking not found", 404));
    }

    // Prevent double payment
    if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
      return next(new AppError("Payment already completed for this booking", 400));
    }


    /* ---------------- CASH FLOW ---------------- */
    if (paymentMethod === PAYMENT_METHOD.CASH) {
      booking.paymentMethod = PAYMENT_METHOD.CASH;
      booking.paymentStatus = PAYMENT_STATUS.PAID;
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.completedAt = new Date();
      await booking.save();
      await resetAvailability(booking);
      if (bookingId) {
        console.log("emitting booking-completed for bookingId:", bookingId);
        io.to(booking?.user?.socketId).emit("booking-completed", {

          bookingId,
        });
      }


      return res.status(200).json({
        success: true,
        message: "Cash payment recorded and booking completed",
        booking
      });
    }

    /* ------------- RAZORPAY FLOW -------------- */
    if (paymentMethod === PAYMENT_METHOD.RAZORPAY) {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return next(new AppError("Razorpay payment details are required", 400));
      }

      const result = await verifyPayment({
        bookingId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      });

      if (!result.success) {
        return next(new AppError("Invalid Razorpay signature", 400));
      }

      booking.paymentMethod = PAYMENT_METHOD.RAZORPAY;
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.completedAt = new Date();
      await booking.save();

      await resetAvailability(booking);

      io.to(booking?.user?.socketId).emit("booking-completed", {
        bookingId
      });

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
    const bookings = await Booking.find({
      user: userId,
      status: BOOKING_STATUS.COMPLETED
    })
      .sort({ createdAt: -1 })
      .populate("primaryEmployee", "empId fullname")
      .populate("employees", "storeName teamId")
      .populate("selectedToolShop", "toolShopId storeLocation");
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
    if (!req.employee) {
      return next(new AppError("Unauthorized", 401));
    }

    const employee = req.employee;
    const role = employee.role;
    let baseFilter = {};

    /* ===============================
       1. ROLE FILTER
    =============================== */
    if (role === ROLES.SINGLE_EMPLOYEE) {
      baseFilter.$or = [
        { primaryEmployee: employee._id },
        { employees: employee._id }
      ];
    }
    else if (role === ROLES.MULTIPLE_EMPLOYEE) {
      baseFilter.servicerCompany = employee._id;
    }
    else if (role === ROLES.TOOL_SHOP) {
      baseFilter.selectedToolShop = employee._id;
    }

    /* ===============================
       2. MODEL + FIELD SELECTION
    =============================== */

    const isToolShop = role === ROLES.TOOL_SHOP;

    const Model = isToolShop ? PartRequest : Booking;

    const priceField = isToolShop ? "$totalCost" : "$totalPrice";

    const matchFilter = isToolShop
      ? { shopId: employee._id, status: PART_REQUEST_STATUS.COLLECTED }
      : { ...baseFilter, status: BOOKING_STATUS.COMPLETED };

    /* ===============================
       3. TIME WINDOWS
    =============================== */

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOf7Days = new Date();
    startOf7Days.setDate(startOf7Days.getDate() - 6);

    const startOf30Days = new Date();
    startOf30Days.setDate(startOf30Days.getDate() - 29);

    const startOf12Months = new Date();
    startOf12Months.setMonth(startOf12Months.getMonth() - 11);

    /* ===============================
       4. BOOKINGS QUERY
    =============================== */

    let bookingsQuery = Model.find(matchFilter).sort({ createdAt: -1 });

    if (!isToolShop) {
      bookingsQuery = bookingsQuery
        .populate("user", "fullname phoneMasked")
        .populate("primaryEmployee", "empId fullname")
        .populate("employees", "empId fullname")
        .populate("servicerCompany", "storeName TeamId")
        .populate("selectedToolShop", "shopName storeLocation");
    }
    else {
      bookingsQuery = bookingsQuery
        .populate("bookingId")
        .populate("employeeId", "fullname")
        .populate("shopId", "shopName storeLocation");
    }

    const bookings = await bookingsQuery;

    /* ===============================
       5. PARALLEL DASHBOARD QUERIES
    =============================== */

    const [
      todayStats,
      totalStats,
      weeklyRaw,
      monthlyRaw,
      yearlyRaw
    ] = await Promise.all([

      /* TODAY JOBS + TODAY EARNINGS */

      Model.aggregate([
        {
          $match: {
            ...matchFilter,
            createdAt: { $gte: startOfToday }
          }
        },
        {
          $group: {
            _id: null,
            todayJobs: { $sum: 1 },
            todayEarnings: { $sum: priceField }
          }
        }
      ]),

      /* TOTAL JOBS + TOTAL REVENUE */

      Model.aggregate([
        {
          $match: {
            ...matchFilter
          }
        },
        {
          $group: {
            _id: null,
            totalDone: { $sum: 1 },
            totalRevenue: { $sum: priceField }
          }
        }
      ]),

      /* WEEKLY CHART */

      Model.aggregate([
        {
          $match: {
            ...matchFilter,
            createdAt: { $gte: startOf7Days }
          }
        },
        {
          $group: {
            _id: { $dayOfWeek: "$createdAt" },
            amount: { $sum: priceField }
          }
        }
      ]),

      /* MONTHLY CHART */

      Model.aggregate([
        {
          $match: {
            ...matchFilter,
            createdAt: { $gte: startOf30Days }
          }
        },
        {
          $group: {
            _id: { $week: "$createdAt" },
            amount: { $sum: priceField }
          }
        }
      ]),

      /* YEARLY CHART */

      Model.aggregate([
        {
          $match: {
            ...matchFilter,
            createdAt: { $gte: startOf12Months }
          }
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            amount: { $sum: priceField }
          }
        }
      ])

    ]);

    /* ===============================
       6. NORMALIZE WEEKLY DATA
    =============================== */

    const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const weekly = WEEK_DAYS.map((day, index) => {
      const found = weeklyRaw.find(d => d._id === index + 1);
      return {
        _id: day,
        amount: found ? found.amount : 0
      };
    });

    /* ===============================
       7. NORMALIZE MONTHLY DATA
    =============================== */

    const monthly = Array.from({ length: 4 }, (_, i) => ({
      _id: `Week ${i + 1}`,
      amount: monthlyRaw[i]?.amount || 0
    }));

    /* ===============================
       8. NORMALIZE YEARLY DATA
    =============================== */

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const yearly = MONTHS.map((month, index) => {
      const found = yearlyRaw.find(m => m._id === index + 1);
      return {
        _id: month,
        amount: found ? found.amount : 0
      };
    });

    /* ===============================
       9. HIGHEST EARNING
    =============================== */

    const findHighest = (arr) =>
      arr.reduce((max, cur) =>
        cur.amount > max.amount ? cur : max,
        { amount: 0 }
      );

    /* ===============================
       10. RESPONSE
    =============================== */

    return res.status(200).json({
      success: true,

      stats: {
        todayJobs: todayStats[0]?.todayJobs || 0,
        todayEarnings: todayStats[0]?.todayEarnings || 0,
        totalDone: totalStats[0]?.totalDone || 0,
        totalRevenue: totalStats[0]?.totalRevenue || 0
      },

      charts: {
        weekly,
        monthly,
        yearly
      },

      highestEarning: {
        weekly: findHighest(weekly),
        monthly: findHighest(monthly),
        yearly: findHighest(yearly)
      },

      totalBookings: bookings.length,
      bookings
    });

  } catch (err) {
    next(err);
  }
};


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
        $unwind: {
          path: "$serviceInfo",
          preserveNullAndEmptyArrays: true
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

exports.getReviewByService = async (req, res, next) => {
  try {
    if (!req.employeeId) {
      return next(new AppError("Unauthorized", 401));
    }

    const employeeId = new mongoose.Types.ObjectId(req.employeeId);

    const data = await Review.aggregate([
      { $match: { primaryEmployee: employeeId } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgRating: { $avg: "$rating" },
          reviews: {
            $push: {
              rating: "$rating",
              comment: "$comment",
              createdAt: "$createdAt"
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalReviews: 1,
          avgRating: { $round: ["$avgRating", 1] },
          reviews: 1
        }
      }
    ]);

    res.status(200).json(
      data[0] || { totalReviews: 0, avgRating: 0, reviews: [] }
    );

  } catch (err) {
    next(err);
  }
};


// exports.scheduleBooking = async (req, res, next) => {
//   try {
//     const {
// userId,
//       serviceCategoryName,
//       coordinates,
//       address,
//       scheduleDateTime,
//       employeeCount,
//       totalPrice,
//       durationInMinutes
//     } = req.body;

//     const booking = await Booking.create({
//       user:userId,
//       serviceCategoryName,
//       address,
//       location: {
//         type: "Point",
//         coordinates
//       },
//       employeeCount,
//       totalPrice,
//       durationInMinutes,

//       isScheduled: true,
//       scheduleDateTime,
//       scheduleExecuted: false,
//       assignmentStatus: "SEARCHING"
//     });

//     return res.json({
//       success: true,
//       message: "Booking scheduled",
//       bookingId: booking._id
//     });

//   } catch (err) {
//     next(err);
//   }
// };


exports.scheduleBooking = async (req, res, next) => {
  try {
    const {
      serviceCategoryName,
      address,
      coordinates,
      serviceCount = 1,
      scheduleDateTime
    } = req.body;

    const userId = req.userId;

    if (!scheduleDateTime) {
      return next(new AppError("scheduleDateTime is required", 400));
    }

    const scheduleTime = new Date(scheduleDateTime);
    if (isNaN(scheduleTime.getTime()) || scheduleTime <= new Date()) {
      return next(new AppError("Invalid schedule time", 400));
    }

    /* -------------------------
       RESOLVE DOMAIN SERVICE
    ------------------------- */
    const serviceList = await ServiceList.findOne({
      "serviceCategory.serviceCategoryName": serviceCategoryName,
    });

    if (!serviceList) {
      return next(new AppError("Service category not found", 404));
    }

    const category = serviceList.serviceCategory.find(
      c => c.serviceCategoryName === serviceCategoryName
    );

    if (!category) {
      return next(new AppError("Invalid service category", 400));
    }

    const domainServiceId = serviceList.DomainServiceId;


    /* -------------------------
       CREATE BOOKING
    ------------------------- */
    const booking = await Booking.create({
      user: userId,
      serviceCategoryName,
      domainService: domainServiceId,
      serviceType: category.employeeCount === 1 ? "single" : "team",
      serviceCount,
      pricePerService: category.price,
      durationInMinutes: category.durationInMinutes,
      employeeCount: category.employeeCount,
      totalPrice: category.price * serviceCount,
      address,
      location: { type: "Point", coordinates },

      isScheduled: true,
      scheduleDateTime: scheduleTime,
      scheduleExecuted: false,
      assignmentStatus: "SCHEDULED",
    });

    return res.status(201).json({
      success: true,
      message: "Booking scheduled successfully",
      bookingId: booking._id,
      scheduledFor: scheduleTime
    });

  } catch (err) {
    next(err);
  }
};

exports.createVisitBooking = async (req, res, next) => {
  try {
    const { address, location, bookingType } = req.body;
    const { domainServiceId } = req.params;
    if (!address || !location?.coordinates?.length) {
      return next(new AppError("Address and Coordinates are required", 400));
    }
    if (bookingType !== BOOKING_TYPE.ONDEMAND) {
      return next(new AppError("visit service only supports ONDEMAND bookings", 400));
    }
    if (!mongoose.Types.ObjectId.isValid(domainServiceId)) {
      return next(new AppError("Domain service not found", 404));
    }
    const VISIT_PRICE = 99;

    const booking = await Booking.create({
      user: req.userId,
      domainService: domainServiceId,
      visitMode: true,
      proposalStatus: "NONE",
      serviceCategoryName: "Inspection Visit",
      bookingType: BOOKING_TYPE.ONDEMAND,
      pricePerService: VISIT_PRICE,
      totalPrice: VISIT_PRICE,
      employeecount: 1,
      address,
      location: {
        type: "Point",
        coordinates: location.coordinates,
      },
      status: BOOKING_STATUS.PENDING,
      assignmentStatus: "SEARCHING",
    });

    const io = req.app.get("io");
    if (io) {
      await assignNextServicer({
        bookingId: booking._id,
        coordinates: booking.location.coordinates,
      })
    }
    return res.status(201).json({
      success: true,
      message: "visit service booked successfully",
      booking,
    });

  }
  catch (err) {
    next(err);
  }
}

exports.proposeExtraService = async (req, res, next) => {
  try {
    const { bookingId, serviceCategoryId } = req.body;
    const employeeId = req.employeeId;
    const io = req.app.get("io");

    if (!bookingId || !serviceCategoryId) {
      return next(new AppError("bookingId and serviceCategoryId are required", 400));
    }

    const result = await proposeExtraService({
      bookingId,
      serviceCategoryId,
      employeeId,
      io
    });

    res.status(200).json({
      success: true,
      extraService: result
    });
  } catch (err) {
    next(err);
  }
};

exports.approveExtraService = async (req, res, next) => {
  try {
    const { bookingId, extraServiceId, approve } = req.body;
    const userId = req.user._id;
    const io = req.app.get("io");

    if (!bookingId || !extraServiceId || approve === undefined) {
      return next(new AppError("bookingId, extraServiceId and approve (boolean) are required", 400));
    }

    const result = await approveExtraService({
      bookingId,
      extraServiceId,
      approve,
      userId,
      io
    });

    res.status(200).json({
      success: true,
      status: result.status,
      booking: result.booking
    });
  } catch (err) {
    next(err);
  }
};

exports.getActiveUserBookings = async (req, res) => {
  try {
    const userId = req.user._id;
    const bookings = await Booking.find({
      user: userId,
      // Include anything that is currently being processed
      $or: [
        { isScheduled: false, status: { $nin: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED] } },
        { isScheduled: true, assignmentStatus: 'ASSIGNED' } // Scheduled jobs that have started
      ]
    })
      .populate("primaryEmployee", "fullname rating phone avatar") // Show technician details
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// 🔵 GET UPCOMING BOOKINGS (Scheduled for Future)
exports.getScheduledUserBookings = async (req, res) => {
  try {
    const userId = req.user._id;
    const bookings = await Booking.find({
      user: userId,
      isScheduled: true,
      assignmentStatus: "SCHEDULED", // Specifically those waiting in the queue
      status: { $nin: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED] }
    })
      .sort({ scheduleDateTime: 1 }); // Show closest date first
    res.status(200).json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
