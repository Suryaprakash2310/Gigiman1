const { encryptPhone, maskPhone, hashPhone } = require("../utils/crypto");
const User=require('../models/user.model');
const jwt = require("jsonwebtoken");
const axios = require("axios");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

exports.register = async (req, res) => {
  try {
    const { fullName, phoneNo, latitude, longitude, avatar } = req.body;

    if (!fullName || !phoneNo || !avatar) {
      return res.status(400).json({ message: "All fields required" });
    }

    // Reverse geocoding (Nominatim)
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
    const geoRes = await axios.get(url);
    const address = geoRes.data.display_name;

    // Encrypt + mask + hash
    const encryptedPhone = encryptPhone(phoneNo);
    const maskedPhone = maskPhone(phoneNo);
    const phoneHash = hashPhone(phoneNo);

    // Check existing user
    const existingUser = await User.findOne({ phoneHash });
    if (existingUser) {
      return res.status(400).json({ message: "Already registered" });
    }

    // Create new user
    const newUser = await User.create({
      fullName,
      phoneNo: encryptedPhone,
      phoneMasked: maskedPhone,
      phoneHash,
      avatar,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
      address,
    });

    return res.json({
      success: true,
      user: newUser,
      token: generateToken(newUser._id),
      msg: "User registered successfully",
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const { phoneNo } = req.body;

    const phoneHash = hashPhone(phoneNo);

    const user = await User.findOne({ phoneHash });

    if (!user) {
      return res.status(404).json({ message: "User not found. Please register." });
    }

    const otp = Math.floor(1000 + Math.random() * 9000);

    // Store OTP temporarily (Redis or DB)
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
    await user.save();

    // TODO → Use SMS API (Twilio / MSG91 / Fast2SMS)
    console.log("OTP sent:", otp);

    res.json({ success: true, message: "OTP sent to your phone" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.verifyOtp = async (req, res) => {
  try {
    const { phoneNo, otp } = req.body;

    const phoneHash = hashPhone(phoneNo);

    const user = await User.findOne({ phoneHash });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // Clear OTP
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Generate JWT
    const token = generateToken(user._id);

    return res.json({
      success: true,
      token,
      user,
      message: "Login successful",
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    // user already attached by middleware
    if(!req.user){
        return res.status(400).json({message:"User not found"});
    }
    res.json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

