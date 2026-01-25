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

exports.sendOtp = async (req, res, next) => {
  try {
    //Get the phone number
    const { phoneNo } = req.body;
    if (!phoneNo)
      return next(new AppError("Phone number is required",400));

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

    console.log(`OTP for ${cleanPhone}: ${otp}`);

    return res.status(200).json({
      message: "OTP sent successfully",
      otp  //temporary for testing purposes
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
    const services = await DomainService.find(
      {},
      { domainName: 1, serviceImage: 1 }
    )
      .sort({ domainName: 1 })
      .lean()
    // returns plain JS objects, faster than Mongoose docs
    if(!services || services.length===0){
      return next(new AppError("No services found", 404));
    }
    return res.status(200).json({
      success: true,
      count: services.length,
      services
    })
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
}

//Search the service
exports.searchService = async (req, res, next) => {
  try {
    const { q = "" } = req.query;

    const services = await DomainService.aggregate([
      {
        $match: {
          domainName: { $regex: "^" + q, $options: "i" }
        }
      },
      { $sort: { domainName: 1 } }
    ]);

    res.status(200).json({
      success: true,
      count: services.length,
      services
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


exports.ShowsubService = async (req, res, next) => {
  try {
    const data = await ServiceList.find()
      .populate("DomainServiceId", "domainName serviceImage")
      .sort({ serviceName: 1 });
    if (!data || data.length === 0) {
      return next(new AppError("Service is empty", 404));
    }
    const serviceNames = data.map(item => item.serviceName);
    const categoriesservices = data.flatMap(item =>
      item.serviceCategory.map(sub => ({
        _id: sub._id,
        parentServiceName: item.serviceName,
        domainServiceId: item.DomainServiceId?._id,
        domainServiceName: item.DomainServiceId?.domainServiceName,
        subserviceImage: sub.servicecategoryImage,
        serviceCategoryName: sub.serviceCategoryName,
        description: sub.description,
        price: sub.price,
        durationInMinutes: sub.durationInMinutes,
        employeeCount: sub.employeeCount,
      }))
    );

    const groupedServices = data.map(item => ({
      serviceName: item.serviceName,
      domainServiceId: item.DomainServiceId?._id,
      categories: item.serviceCategory.map(sub => ({
        _id: sub._id,
        serviceCategoryName: sub.serviceCategoryName,
        descritpion: sub.description,
        subserviceImage: sub.servicecategoryImage,
        price: sub.price,
        durationInMinutes: sub.durationInMinutes,
        employeCount: sub.employeeCount,
      }))
    }))
    return res.status(200).json({
      success: true,
      message: "showing the subservice",
      serviceNames,
      categoriesservices,
      groupedServices,
      countServices: data.length,
      countCategories: categoriesservices.length,
    })

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

    const service = await ServiceList.findOne(
      { "serviceCategory._id": categoryObjectId }
    ).lean();

    if (!service) {
      return next(new AppError("Service category not found", 404));
    }

    const category = service.serviceCategory.find(
      (cat) => cat._id.toString() === serviceCategoryId
    );

    res.status(200).json({
      success: true,
      serviceName: service.serviceName,
      domainServiceId: service.DomainServiceId,
      serviceCategory: category,
    });

  } catch (err) {
    next(err); //let Global error handler deal with it  
  }
};

//get the all subservice by domainServiceId
exports.ShowsubserviceId = async (req, res, next) => {
  try {
    const { domainServiceId } = req.params;

    const services = await ServiceList.find({
      DomainServiceId: domainServiceId
    })
      .sort({ createdAt: 1 }) // oldest first, optional
      .lean();
    if(!services || services.length===0){
      return next(new AppError("No services found for the given domainServiceId", 404));
    }

    res.status(200).json({
      success: true,
      serviceName: service.serviceName,
      domainServiceId: service.DomainServiceId,
      serviceCategory: category,
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};
