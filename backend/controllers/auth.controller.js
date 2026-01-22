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
// Generate JWT token
const generateToken = (employee) => {
  return jwt.sign(
    {
      id: employee._id,
      employeeId: employee.employeeId,
      role: employee.role
    },
    process.env.JWT_KEY,
    { expiresIn: "7d" }
  );

};

exports.sendOtp = async (req, res) => {
  try {
    const { phoneNo } = req.body;

    if (!phoneNo)
      return res.status(400).json({ message: "Phone number is required" });

    const cleanPhone = normalizePhone(phoneNo);

    // Check employee existence
    const emp =
      (await SingleEmployee.findOne({ phoneNo })) ||
      (await MultipleEmployee.findOne({ phoneNo })) ||
      (await ToolShop.findOne({ phoneNo }));
    if (!emp)
      return res.status(404).json({ message: "Employee not found" });

    const existingOtp = await Otp.findOne({ cleanPhone });

    if (existingOtp && existingOtp.resendCount >= 5) {
      return res.status(429).json({
        message: "Maximum OTP limit reached. Try again later.",
      });
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
    });
  } catch (err) {
    console.error("OTP send error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.verifyOtp = async (req, res) => {
  try {
    const { phoneNo, otp } = req.body;

    if (!phoneNo || !otp)
      return res.status(400).json({ message: "Phone and OTP required" });

    const cleanPhone = normalizePhone(phoneNo);

    const emp =
      (await SingleEmployee.findOne({ phoneNo })) ||
      (await MultipleEmployee.findOne({ phoneNo })) ||
      (await ToolShop.findOne({ phoneNo }));

    if (!emp)
      return res.status(404).json({ message: "Employee not found" });

    const otpRecord = await Otp.findOne({ cleanPhone });

    if (!otpRecord)
      return res.status(400).json({ message: "OTP not found or expired" });

    if (new Date() > otpRecord.expiresAt) {
      await Otp.deleteOne({ cleanPhone });
      return res.status(400).json({ message: "OTP expired" });
    }

    if (otpRecord.otp.toString() !== otp.toString()) {
      otpRecord.attempts += 1;

      if (otpRecord.attempts >= 5) {
        await Otp.deleteOne({ cleanPhone });
        return res
          .status(429)
          .json({ message: "Too many failed attempts" });
      }

      await otpRecord.save();
      return res.status(400).json({ message: "Invalid OTP" });
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
    console.error("OTP verify error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


//Show the services

exports.ShowServices = async (req, res) => {
  try {
    const services = await DomainService.aggregate([
      { $sort: { domainName: 1 } }
    ]);

    if (!services || services.length === 0) {
      return res.status(404).json({ message: "No services found" });
    }

    return res.status(200).json({
      message: "Services fetched successfully",
      count: services.length,
      services,
    });

  } catch (err) {
    console.error("Service get issue", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


//Search the service
exports.searchService = async (req, res) => {
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
    console.error("Searching controller error", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.ShowsubService = async (req, res) => {
  try {
    const data = await ServiceList.find()
      .populate("DomainServiceId", "domainName serviceImage")
      .sort({ serviceName: 1 });
    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Service is empty" });
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
    console.error("showsubservice error", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getServiceCategoryById = async (req, res) => {
  try {
    const { domainServiceId } = req.params;

    const services = await ServiceList.find({
      DomainServiceId: domainServiceId
    })
    .sort({ createdAt: 1 }) // oldest first, optional
    .lean();

    res.status(200).json({
      success: true,
      services
    });
  } catch (err) {
    console.error("getServiceListByDomain error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

exports.ShowsubserviceId = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await ServiceList.findById(
      id,
      { serviceCategory: 1, serviceName: 1 }
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service categories fetched successfully",
      serviceName: service.serviceName,
      serviceCategory: service.serviceCategory || [],
    });
  } catch (err) {
    console.error("ShowSubServiceId error controller", err.message);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};
