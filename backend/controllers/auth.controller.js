const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const DomainService = require("../models/domainservice.model");
const Otp = require('../models/otp.model')
const { normalizePhone } = require("../utils/crypto");
const ServiceList = require("../models/serviceList.model");
const mongoose = require('mongoose');
const generateToken = require("../config/token");
const AppError = require("../utils/AppError");
const firebase = require("../config/firebase");

exports.sendOtp = async (req, res, next) => {
  try {
    //Get the phone number
    const { phoneNo } = req.body;
    if (!phoneNo)
      return next(new AppError("Phone number is required", 400));

    // Check employee existence
    const emp =
      (await SingleEmployee.findOne({ phoneNo })) ||
      (await MultipleEmployee.findOne({ phoneNo })) ||
      (await ToolShop.findOne({ phoneNo }));

    if (!emp)
      return next(new AppError("Employee not found", 404));

    const cleanPhone = normalizePhone(phoneNo);

    // Generate a 6-digit OTP
    const otpValue = Math.floor(1000 + Math.random() * 9000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save/Update OTP
    await Otp.findOneAndUpdate(
      { cleanPhone },
      { otp: otpValue, expiresAt, attempts: 0 },
      { upsert: true, new: true }
    );
    console.log(otpValue)

    // Send via Firebase or other SMS provider
    // await firebase.auth().... (If using backend-initiated SMS)
    // For now, we'll just log it or handle it via frontend Firebase SDK
    console.log(`OTP for ${cleanPhone}: ${otpValue}`);

    return res.status(200).json({
      success: true,
      otp: otpValue,
      message: "OTP generated successfully",
    });
  } catch (err) {
    next(err);
  }
};


exports.verifyOtp = async (req, res, next) => {
  try {
    const { phoneNo, otp } = req.body;

    if (!phoneNo || !otp)
      return next(new AppError("Phone number and OTP are required", 400));

    const cleanPhone = normalizePhone(phoneNo);

    // Find OTP record
    const otpRecord = await Otp.findOne({ cleanPhone });

    if (!otpRecord) {
      return next(new AppError("OTP not found or expired", 400));
    }

    // Verify OTP
    if (otpRecord.otp !== parseInt(otp)) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return next(new AppError("Invalid OTP", 400));
    }

    // Delete OTP record
    await Otp.deleteOne({ cleanPhone });

    const emp =
      (await SingleEmployee.findOne({ phoneNo: cleanPhone })) ||
      (await MultipleEmployee.findOne({ phoneNo: cleanPhone })) ||
      (await ToolShop.findOne({ phoneNo: cleanPhone }));

    if (!emp)
      return next(new AppError("Employee not found", 404));

    const token = generateToken(emp);
    return res.status(200).json({
      success: true,
      id: emp._id,
      role: emp.role,
      phoneNo: emp.phoneMasked,
      token,
      message: "Login successful",
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
    console.log(domainServiceId)
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




