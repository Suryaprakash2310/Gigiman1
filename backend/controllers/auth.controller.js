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
const Ticket = require("../models/ticket.model");
const { sendOTP } = require("../utils/msg91");

exports.sendOtp = async (req, res, next) => {
  try {
    //Get the phone number
    const { phoneNo } = req.body;
    if (!phoneNo)
      return next(new AppError("Phone number is required", 400));

    const cleanPhone = normalizePhone(phoneNo);

    // Check employee existence
    const emp =
      (await SingleEmployee.findOne({ phoneNo })) ||
      (await MultipleEmployee.findOne({ phoneNo })) ||
      (await ToolShop.findOne({ phoneNo }));

    if (!emp)
      return next(new AppError("Employee not found", 404));

    const existingOtp = await Otp.findOne({ cleanPhone });

    if (existingOtp && existingOtp.resendCount >= 5) {
      return next(new AppError("Maximum OTP limit reached. Try again later.", 429));
    }

    const otp = crypto.randomInt(1000, 9999);

    await Otp.findOneAndUpdate(
      { cleanPhone },
      {
        otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
        $inc: { resendCount: 1 },
      },
      { upsert: true, new: true }
    );

    // ...
    console.log(`OTP for ${cleanPhone}: ${otp}`);

    // Call MSG91 to send OTP sms
    await sendOTP(cleanPhone, otp);

    return res.status(200).json({
      message: "OTP sent successfully",
      // otp  //temporary for testing purposes
    });
  } catch (err) {
    next(err);
  }
};


exports.verifyOtp = async (req, res, next) => {
  try {
    const { phoneNo, otp } = req.body;

    if (!phoneNo || !otp)
      return next(new AppError("Phone and OTP required", 400));

    const cleanPhone = normalizePhone(phoneNo);

    const emp =
      (await SingleEmployee.findOne({ phoneNo })) ||
      (await MultipleEmployee.findOne({ phoneNo })) ||
      (await ToolShop.findOne({ phoneNo }));

    if (!emp)
      return next(new AppError("Employee not found", 404));

    const otpRecord = await Otp.findOne({ cleanPhone });

    if (!otpRecord)
      return next(new AppError("OTP not found or expired", 400));

    if (new Date() > otpRecord.expiresAt) {
      await Otp.deleteOne({ cleanPhone });
      return next(new AppError("OTP expired", 400));
    }

    if (otpRecord.otp.toString() !== otp.toString()) {
      otpRecord.attempts += 1;

      if (otpRecord.attempts >= 5) {
        await Otp.deleteOne({ cleanPhone });
        return next(new AppError("Maximum OTP attempts exceeded. Please request a new OTP.", 429));
      }

      await otpRecord.save();
      return next(new AppError("Invalid OTP", 400));
    }

    // OTP success
    await Otp.deleteOne({ cleanPhone });

    const token = generateToken(emp);
    return res.status(200).json({
      id: emp._id,
      role: emp.role,
      phoneNo: emp.phoneMasked,
      token,
      message: "Login successful",
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
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
      .limit(10)
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

exports.createTicket = async (req, res, next) => {
  try {
    const { message, category } = req.body;
    if (!message || !category) {
      return next(new AppError("All fields are required", 400));
    }
    const raisedBy = req.raisedById;
    const raisedByModel = req.raisedByModel;

    if (!raisedBy || !raisedByModel) {
      return next(new AppError("All fields are required", 400));
    }
    const ticket = await Ticket.create({
      raisedBy: req.raisedById,
      raisedByModel: req.raisedByModel,
      message: req.body.message,
      category: req.body.category
    });

    return res.status(201).json(ticket);

  }
  catch (err) {
    next(err);
  }
}


