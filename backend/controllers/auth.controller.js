const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const Shop = require("../models/toolshop.model");
const DomainService = require("../models/domainservice.model");
const { hashPhone } = require("../utils/crypto");

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
      await Shop.findOne({ phoneHash });

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
      await Shop.findOne({ phoneHash });

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
      type: user.constructor.modelName,
      phoneNo: user.phoneMasked,
      data: user,
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
          domainName: { $regex: q, $options: "i" }
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


exports.partrequest = async (req, res) => {
  try {

  } catch (err) {

  }
}