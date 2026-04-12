const jwt = require('jsonwebtoken');
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const ROLES = require('../enum/role.enum');
const Review = require('../models/review.model');
const AppError = require('../utils/AppError');
const { uploadToCloudinary } = require('../utils/uploadHandler');
const cloudinary = require('../config/cloudinary');
const Commission = require('../models/commissionwallet.model');
const mongoose = require('mongoose');

exports.getProfile = async (req, res, next) => {
  try {
    const employeeId = req.employee.id;

    let employee =
      (await SingleEmployee.findById(employeeId)) ||
      (await MultipleEmployee.findById(employeeId)) ||
      (await ToolShop.findById(employeeId));

    if (!employee) {
      return next(new AppError("Employee not found", 404))
    }

    // --- Commission Check ---
    const unpaidData = await Commission.aggregate([
      { $match: { empId: new mongoose.Types.ObjectId(employeeId), status: { $ne: 'PAID' } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const totalUnpaid = unpaidData[0]?.total || 0;

    //  If MULTIPLE EMPLOYEE → include team details
    if (employee.role === ROLES.MULTIPLE_EMPLOYEE) {

      const members = await SingleEmployee.find({
        empId: { $in: employee.members }
      }).select("empId fullname teamAccepted");

      const pendingRequests = await SingleEmployee.find({
        empId: { $in: employee.pendingRequests }
      }).select("empId fullname teamAccepted");

      return res.status(200).json({
        success: true,
        employee: {
          ...employee._doc,
          members,
          pendingRequests
        }
      });
    }

    // Normal user (single employee or shop)
    return res.status(200).json({
      success: true,
      employee: {
        ...employee.toObject ? employee.toObject() : employee,
        unpaidCommission: totalUnpaid,
        isBlockedByCommission: totalUnpaid >= 1000,
        commissionThreshold: 1000
      }
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


exports.editprofile = async (req, res, next) => {
  try {
    const employee = req.employee;
    const role = req.role;
    const { avatar } = req.body;

    let allowFields = [];
    if (role === ROLES.SINGLE_EMPLOYEE) {
      allowFields = ["fullname", "address", "avatar", 'latitude', 'longitude', 'services'];
    }
    if (role === ROLES.MULTIPLE_EMPLOYEE) {
      allowFields = ["storeName", "ownerName", "storeLocation", "avatar", 'latitude', 'longitude', 'services'];
    }
    if (role === ROLES.TOOL_SHOP) {
      allowFields = ["shopName", "ownerName", "storeLocation", "avatar", 'latitude', 'longitude', 'services'];
    }
    //validate incoming fields
    const updates = Object.keys(req.body);

    const valid = updates.every((f) => allowFields.includes(f));

    if (!valid) {
      return next(new AppError("Invalid updates!", 400));
    }

    // Handle Avatar Upload: Case 1: Multer File Upload (Preferred)
    if (req.file) {
      const folder = role === ROLES.SINGLE_EMPLOYEE ? "employees/avatars" : "companies/logos";
      const result = await uploadToCloudinary(req.file, folder);
      employee.avatar = result.url;
    }
    // Case 2: Manual Base64 Upload (Fallback)
    else if (avatar) {
      const folder = role === ROLES.SINGLE_EMPLOYEE ? "employees/avatars" : "companies/logos";
      const uploadResult = await cloudinary.uploader.upload(avatar, {
        folder: folder,
        transformation: [{ width: 300, height: 300, crop: "fill" }]
      });
      employee.avatar = uploadResult.secure_url;
    }

    //Apply updates dynamically
    updates.forEach((field) => {
      if (field === "avatar") return; // Already handled above

      if (field === "address" && typeof req.body.address === "object") {
        // Merge address fields
        employee.address = {
          ...employee.address,
          ...req.body.address,
        };
      } else {
        employee[field] = req.body[field];
      }
    });

    await employee.save();
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      updateProfile: employee
    })
  } catch (err) {
    next(err);
  }
}

exports.getMyJobReview = async (req, res, next) => {
  try {
    const employee = req.employee;
    let filter = {};

    if (employee.role === ROLES.SINGLE_EMPLOYEE) {
      filter.$or = [{ primaryEmployee: employee._id },
      { helpers: employee._id }
      ]
    }
    else if (employee.role === ROLES.MULTIPLE_EMPLOYEE) {
      filter.company = employee._id;
    }
    else {
      return next(new AppError("Access denied", 403));
    }

    const reviews = await Review.find(filter)
      .populate("user", "fullName phoneMasked")
      .populate("primaryEmployee", "empId fullname")
      .populate("company", "ownerName TeamId")
      .populate("helpers", "empId fullname")
      .populate("booking", "serviceCategoryName totalPrice completedAt")

    if (reviews.length === 0) {
      return next(new AppError("No reviews found", 404));
    }

    return res.status(200).json({
      success: true,
      reviews
    });

  } catch (err) {
    next(err);
  }
}