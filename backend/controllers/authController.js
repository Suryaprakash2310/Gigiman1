const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const SingleEmployee = require("../models/singleEmployee");
const MultipleEmployee = require("../models/multipleEmployee.model");
const Shop = require("../models/toolshop.model");
const DomainService = require("../models/domainservice.model");
const Domainparts = require("../models/domainparts.model");
const { error } = require("console");
// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: "7d" });
};

// Temporary in-memory OTP store (for demo purposes)
// In production, store in DB with expiry
const otpStore = {};

exports.sendOtp = async (req, res) => {
  const { phoneNo } = req.body;
  if (!phoneNo) return res.status(400).json({ message: "Phone number is required" });

  try {
    // Check if user exists in any model
    let user = await SingleEmployee.findOne({ phoneNo }) ||
      await MultipleEmployee.findOne({ phoneNo }) ||
      await Shop.findOne({ phoneNo });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999);
    otpStore[phoneNo] = otp; // save OTP temporarily
    console.log(`OTP for ${phoneNo} is ${otp}`); // in real app, send via SMS

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("OTP error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  const { phoneNo, otp } = req.body;
  if (!phoneNo || !otp) return res.status(400).json({ message: "Phone and OTP required" });

  try {
    const user = await SingleEmployee.findOne({ phoneNo }) ||
      await MultipleEmployee.findOne({ phoneNo }) ||
      await Shop.findOne({ phoneNo });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Check OTP
    if (otpStore[phoneNo] != otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP verified, delete it
    delete otpStore[phoneNo];

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      id: user._id,
      type: user.constructor.modelName,
      data: user,
      token,
      message: "Login successful",
    });
  } catch (err) {
    console.error("OTP verify error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.ShowServices = async (req, res) => {
  try {
    const services = await DomainService.find()
      .collation({ locale: "en", strength: 2 }) // Case-insensitive sorting
      .sort({ domainName: 1 })                  // A -> Z alphabetical
      .lean();                                   // Convert to plain JSON (avoid circular reference)

    if (!services || services.length === 0) {
      return res.status(404).json({ message: "No services found" });
    }

    return res.status(200).json({
      message: "Services fetched successfully",
      count: services.length,
      services
    });

  } catch (err) {
    console.error("Service get issue", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.searchService = async (req, res) => {
  try {
    const { q } = req.query;
    const services = await DomainService.find({
      domainName: { $regex: q, $options: "i" },
    })
      .collation({ locale: "en", strength: 2 }) // Case Sentative sorting
      .sort({ domainName: 1 })              // A -> Z alphabetical
      .lean();                            // Convert to plain JSON (avoid circular reference)

    res.status(200).json({ services });
  } catch (err) {
    console.error("Searching controller error", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}
//showparts
exports.showParts = async (req, res) => {
  try {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({ message: "Job must be created before viewing parts" });
    }
    const partsList = await Domainparts.find()
      .collate({ locate: "en", strength: 2 })
      .sort({ domaintoolname: 1 })
      .lean();
    partsList.forEach((item) => {
      item.parts.sort((a, b) => a.partsname.localeCompare(b.partsname));
    });
    res.status(200).json({
      success: true,
      jobId,
      partsAvaiable: partsList,
    });
  } catch (err) {
    console.error("Error showing parts:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

exports.searchparts = async (req, res) => {
  try {
    const { q } = req.query;
    const parts = await Domainparts.find({
      domaintoolname: { $regex: q, $options: "i" },
    }).collation({ locate: "en", strength: 2 })
      .sort({ domaniName: 1 })
      .lean();
    res.status(200).json({ parts });
  }
  catch (err) {
    console.error("Searching the parts issue", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}