const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const DomainService = require("../models/domainservice.model");
const { normalizePhone } = require("../utils/crypto");
const ServiceList = require("../models/serviceList.model");
const mongoose = require('mongoose');
const generateToken = require("../config/token");
const AppError = require("../utils/AppError");
const admin = require("../config/firebase");
const Commission = require("../models/commissionwallet.model");

exports.sendOtp = async (req, res, next) => {
  try {
    const { phoneNo } = req.body;
    if (!phoneNo)
      return next(new AppError("Phone number is required", 400));

    // Check employee existence
    const cleanPhone = normalizePhone(phoneNo);
    const emp =
      (await SingleEmployee.findOne({ phoneNo: cleanPhone })) ||
      (await MultipleEmployee.findOne({ phoneNo: cleanPhone })) ||
      (await ToolShop.findOne({ phoneNo: cleanPhone }));

    if (!emp)
      return next(new AppError("Employee not found", 404));

    // In the Firebase flow, the SMS OTP is triggered from the mobile app (Frontend).
    console.log(`Firebase flow: Client will handle sending SMS OTP to ${cleanPhone}`);

    return res.status(200).json({
      success: true,
      message: "Phone number validated. Please trigger Firebase SMS OTP on the client.",
    });
  } catch (err) {
    next(err);
  }
};


exports.verifyOtp = async (req, res, next) => {
  try {
    const { phoneNo, firebaseToken } = req.body;

    if (!phoneNo || !firebaseToken)
      return next(new AppError("Phone number and Firebase Token are required", 400));

    const cleanPhone = normalizePhone(phoneNo);

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    } catch (error) {
      if (error.code === 'auth/id-token-expired') {
        return next(new AppError("Firebase token has expired", 401));
      }
      return next(new AppError("Invalid Firebase token", 401));
    }

    const firebasePhone = normalizePhone(decodedToken.phone_number);

    if (firebasePhone !== cleanPhone) {
      return next(new AppError("Phone number mismatch. Verification failed.", 400));
    }

    const emp =
      (await SingleEmployee.findOne({ phoneNo: cleanPhone })) ||
      (await MultipleEmployee.findOne({ phoneNo: cleanPhone })) ||
      (await ToolShop.findOne({ phoneNo: cleanPhone }));

    if (!emp)
      return next(new AppError("Employee not found", 404));

    const token = generateToken(emp);

    const unpaidData = await Commission.aggregate([
      { $match: { empId: emp._id, status: { $ne: 'PAID' } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const totalUnpaid = unpaidData[0]?.total || 0;

    return res.status(200).json({
      success: true,
      id: emp._id,
      role: emp.role,
      phoneNo: emp.phoneMasked,
      token,
      message: "Login successful",
      isBlocked: emp.isBlocked || totalUnpaid >= 1000,
      unpaidCommission: totalUnpaid,
      showCommissionBlock: totalUnpaid >= 1000
    });
  } catch (err) {
    next(err);
  }
};


//Show the services

exports.ShowServices = async (req, res, next) => {
  try {
    const services = await DomainService.find({}, {
      _id: 1,
      domainName: 1,
      serviceImage: 1
    })
      .sort({ domainName: 1 })
      .lean();

    if (services.length === 0) {
      return next(new AppError("No services found", 404));
    }

    res.status(200).json({
      success: true,
      count: services.length,
      services
    });
  } catch (err) {
    next(err);
  }
};


//Search the service
exports.searchService = async (req, res, next) => {
  try {
    const { q = "" } = req.query;

    const services = await DomainService.find({
      domainName: { $regex: "^" + q, $options: "i" }
    })
      .sort({ domainName: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: services.length,
      services
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


//Get specific service category by serviceCategoryId
exports.getServiceCategoryById = async (req, res, next) => {
  try {
    const { serviceCategoryId } = req.params;

    if (!serviceCategoryId) {
      return next(new AppError("serviceCategoryId is required", 400));
    }

    const categoryObjectId = new mongoose.Types.ObjectId(serviceCategoryId);

    const service = await ServiceList.aggregate([
      {
        $match: {
          "serviceCategory._id": categoryObjectId
        }
      },
      { $unwind: "$serviceCategory" },
      {
        $match: {
          "serviceCategory._id": categoryObjectId
        }
      },
      {
        $project: {
          _id: 1,
          serviceName: 1,
          domainServiceId: 1,
          serviceCategory: {
            _id: "$serviceCategory._id",
            serviceCategoryName: "$serviceCategory.serviceCategoryName",
            description: "$serviceCategory.description",
            servicecategoryImage: "$serviceCategory.servicecategoryImage",
            price: "$serviceCategory.price",
            durationInMinutes: "$serviceCategory.durationInMinutes",
            employeeCount: "$serviceCategory.employeeCount",
          }
        }
      },
      { $limit: 1 }
    ])
    if (!service || service.length === 0) {
      return next(new AppError("Service category not found", 404));
    }

    res.status(200).json({
      success: true,
      serviceName: service[0].serviceName,
      domainServiceId: service[0].domainServiceId,
      serviceCategory: service[0].serviceCategory,
    });

  } catch (err) {
    next(err); //let Global error handler deal with it  
  }
};

//get the all subservice by domainServiceId
exports.ShowsubserviceId = async (req, res, next) => {
  try {
    const { domainServiceId } = req.params;
    if (!domainServiceId || !mongoose.Types.ObjectId.isValid(domainServiceId)) {
      return next(new AppError("Invalid or missing DomainServiceId", 400));
    }
    const services = await ServiceList.find({
      DomainServiceId: domainServiceId
    },
      {
        serviceName: 1,
        "serviceCategory._id": 1,
        "serviceCategory.serviceCategoryName": 1,
        "serviceCategory.description": 1,
        "serviceCategory.servicecategoryImage": 1,
        "serviceCategory.price": 1,
        "serviceCategory.durationInMinutes": 1,
        "serviceCategory.employeeCount": 1,
        createdAt: 1,
      })
      .sort({ createdAt: 1 }) // oldest first, optional
      .lean();

    res.status(200).json({
      success: true,
      services
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};




