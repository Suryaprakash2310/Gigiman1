const Booking = require("../models/Booking.model");
const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const { makeMaskedCall } = require("../utils/exotel.util");
const AppError = require("../utils/AppError");


exports.initiateCall = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return next(new AppError("bookingId is required", 400));
    }

    const booking = await Booking.findById(bookingId)
      .populate("user")
      .populate("primaryEmployee")
      .populate("servicerCompany");

    if (!booking) {
      return next(new AppError("Booking not found", 404));
    }

    // Determine numbers
    const userPhone = booking.user?.phoneNo;
    let servicePhone = null;

    if (booking.primaryEmployee) {
      servicePhone = booking.primaryEmployee.phoneNo;
    } else if (booking.servicerCompany) {
      servicePhone = booking.servicerCompany.phoneNo;
    }

    if (!userPhone || !servicePhone) {
      return next(new AppError("Could not find phone numbers for both parties", 400));
    }

    // Role-based logic: Determine who is calling whom
    // For masking, Exotel will bridge both to a virtual number.
    // We can decide who to call first. Usually the initiator.

    let from, to;

    // Use req.userId (User) or req.employeeId (Employee) to determine the initiator
    if (req.userId && req.userId.toString() === booking.user?._id.toString()) {
      from = userPhone;
      to = servicePhone;
    } else if ((req.employeeId || req.userId) &&
      ((booking.primaryEmployee && (req.employeeId?.toString() === booking.primaryEmployee._id.toString() || req.userId?.toString() === booking.primaryEmployee._id.toString())) ||
        (booking.servicerCompany && (req.employeeId?.toString() === booking.servicerCompany._id.toString() || req.userId?.toString() === booking.servicerCompany._id.toString())))) {
      from = servicePhone;
      to = userPhone;
    } else {
      // If neither or it's an admin, default to user first
      from = userPhone;
      to = servicePhone;
    }

    const result = await makeMaskedCall(from, to);

    return res.status(200).json({
      success: true,
      message: "Masked call initiated",
      result
    });

  } catch (error) {
    next(error);
  }
};
