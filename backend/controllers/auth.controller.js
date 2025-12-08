const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const DomainService = require("../models/domainservice.model");
const { hashPhone } = require("../utils/crypto");
const ServiceList = require("../models/serviceList.model");

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: "7d" });
};

// Temporary in-memory OTP store (for demo purposes)
// In production, store in DB with expiry
const otpStore = {};

exports.sendOtp = async (req, res) => {
  try {
    const { phoneNo } = req.body;
    if (!phoneNo) return res.status(400).json({ message: "Phone number is required" });
    const phoneHash = hashPhone(phoneNo);
    // Check if user exists in any model
    let user = await SingleEmployee.findOne({ phoneHash }) ||
      await MultipleEmployee.findOne({ phoneHash }) ||
      await ToolShop.findOne({ phoneHash });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate 4-digit OTP
    const otp = crypto.randomInt(1000, 9999);
    // save OTP temporarily
    otpStore[phoneHash] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,// OTP valid for 5 mins
      attempts: 0//Attempts is verify 
    };
    console.log(`OTP for ${phoneNo} is ${otp}`); // in real app, send via SMS

    res.status(200).json({ message: "OTP sent successfully", otp }); // send OTP in response for testing
  } catch (err) {
    console.error("OTP error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { phoneNo, otp } = req.body;
    if (!phoneNo || !otp) return res.status(400).json({ message: "Phone and OTP required" });

    const phoneHash = hashPhone(phoneNo);
    let user = await SingleEmployee.findOne({ phoneHash }) ||
      await MultipleEmployee.findOne({ phoneHash }) ||
      await ToolShop.findOne({ phoneHash });

    if (!user) return res.status(404).json({ message: "User not found" });

    const store = otpStore[phoneHash]; // use Redis in prod
    if (!store) return res.status(400).json({ message: "OTP not found or expired" });
    if (Date.now() > store.expiresAt) {
      delete otpStore[phoneHash];
      return res.status(400).json({ message: "OTP expired" });
    }
    if (store.otp.toString() !== otp.toString()) {
      store.attempts++;
      if (store.attempts >= 5) {
        delete otpStore[phoneHash];
        return res.status(429).json({ message: "Too many invalid attempts" });
      }
      return res.status(400).json({ message: "Invalid OTP" });
    }


    // OTP verified, delete it
    delete otpStore[phoneHash];

    // Generate JWT token
    const token = generateToken(user);

    res.status(200).json({
      id: user._id,
      role: user.role,
      phoneNo: user.phoneMasked,
      token,
      message: "Login successful",
    });
  } catch (err) {
    console.error("OTP verify error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
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
          domainName: { $regex: "^"+q, $options: "i" }
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
    const data = await ServiceList.find().sort({ serviceName: 1 });

    if (!data || data.length === 0) {
      return res.status(400).json({ message: "No SubService" });
    }

    //  Separate Service Names
    const serviceNames = data.map(item => item.serviceName);

    //  Separate Category Services (Flattened)
    let categoryServices = [];

    data.forEach(item => {
      item.serviceCategory.forEach(sub => {
        categoryServices.push({ 
          parentServiceName: item.serviceName,
          _id: sub._id,
          serviceCategoryName:sub.serviceCategoryName,
          description: sub.description,
          price: sub.price,
          ServicecategoryImage:sub.ServicecategoryImage,
          durationInMinutes: sub.durationInMinutes
        });
      });
    });

    return res.status(200).json({
      success: true,
      message: "Sub Services fetched successfully",

      serviceNames,       // Only serviceName list
      categoryServices,   // Flattened sub-services list
      countServices: data.length,
      countCategories: categoryServices.length
    });

  } catch (err) {
    return res.status(500).json({ message: "Server error",error:err.message });
  }
};

exports.SetSubService = async (req, res) => {
  try {
    const { DomainServiceId, serviceName, ServiceCategory } = req.body;

    if (!DomainServiceId || !serviceName) {
      return res.status(400).json({ message: "All fields required" });
    }

    if (
      !ServiceCategory.serviceCategoryName ||
      !ServiceCategory.description ||
      !ServiceCategory.price ||
      !ServiceCategory.durationInMinutes||
      !ServiceCategory.ServicecategoryImage
    ) {
      return res.status(400).json({ message: "Servicecategory field is required" });
    }

    // Check if the serviceName exists
    const existingService = await ServiceList.findOne({ serviceName });

    //  If service exists → check if category exists
    if (existingService) {
      const categoryExists = existingService.serviceCategory.some(
        (item) =>
          item.serviceCategoryName === ServiceCategory.serviceCategoryName
      );

      if (categoryExists) {
        return res.status(400).json({
          message: "This service category already exists",
        });
      }

      //  Add category to existing service
      existingService.serviceCategory.push(ServiceCategory);
      await existingService.save();

      return res.status(200).json({
        success: true,
        message: "Category added successfully to existing service",
        data: existingService,
      });
    }

    //  Service does NOT exist → create new service
    const newService = await ServiceList.create({
      DomainServiceId,
      serviceName,
      serviceCategory: [ServiceCategory],
    });

    return res.status(201).json({
      success: true,
      message: "New service created with category",
      data: newService,
    });

  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
