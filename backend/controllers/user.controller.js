const { encryptPhone, maskPhone, hashPhone } = require("../utils/crypto");
const User = require('../models/user.model');
const Otp = require('../models/otp.model')
const jwt = require("jsonwebtoken");
const axios = require("axios");
const cloudinary = require('../config/cloudinary')

//token generation
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

//Send-otp always
exports.sendOtp = async (req, res) => {
  try {
    const { phoneNo } = req.body;

    if (!phoneNo) {
      return res.status(400).json({ message: "Phone number required" });
    }

    const phoneHash = hashPhone(phoneNo);

    // Ensure user exists (temporary user)
    let user = await User.findOne({ phoneHash });
    if (!user) {
      user = await User.create({
        phoneNo: encryptPhone(phoneNo),
        phoneMasked: maskPhone(phoneNo),
        phoneHash,
        isVerified: false,
      });
    }
    const existingOtp = await Otp.findOne({ phoneHash });

    //  Block if OTP still valid
    if (existingOtp && existingOtp.expiresAt > new Date()) {
      return res.status(429).json({
        message: "OTP already sent. Please wait before resending.",
      });
    }

    //  Max resend limit
    if (existingOtp && existingOtp.resendCount >= 3) {
      return res.status(429).json({
        message: "Resend limit exceeded. Try later.",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000);

    await Otp.findOneAndUpdate(
      { phoneHash },
      {
        otp,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        $inc: { resendCount: 1 },
      },
      { upsert: true, new: true }
    );
    console.log("OTP sent:", otp); // replace with SMS API

    return res.json({ success: true, message: "OTP sent" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//verify otp
exports.verifyOtp = async (req, res) => {
  try {
    const { phoneNo, otp } = req.body;

    const phoneHash = hashPhone(phoneNo);

    const otpDoc = await Otp.findOne({ phoneHash });
    if (!otpDoc) {
      return res.status(400).json({ message: "OTP expired or not found" });
    }
    // OTP expired
    if (new Date() > otpDoc.expiresAt) {
      await Otp.deleteOne({ phoneHash });
      return res.status(400).json({ message: "OTP expired" });
    }
    if (otpDoc.otp.toString() !== otp.toString()) {
      otpDoc.attempts += 1;
      if (otpDoc.attempts >= 5) {
        await Otp.deleteOne({ phoneHash });
        return res
          .status(429)
          .json({ message: "Too many failed attempts. Try again later." });
      }
      await otpDoc.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP verified → remove OTP
    await Otp.deleteOne({ phoneHash });

    const user = await User.findOne({ phoneHash });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isVerified = true;
    await user.save();

    // NEW USER
    if (!user.fullName) {
      return res.json({
        success: true,
        next: "COMPLETE_PROFILE",
        userId: user._id,
      });
    }

    // EXISTING USER
    return res.json({
      success: true,
      token: generateToken(user._id),
      user,
      message: "Login successful",
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//complete profile registeration
exports.completeProfile = async (req, res) => {
  try {
    const { userId, fullName, latitude, longitude, avatar } = req.body;

    if (!userId || !fullName) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Reverse geocoding (optional)
    let address = null;
    if (latitude && longitude) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;
      const geoRes = await axios.get(url, {
        params: {
          access_token: MAP_BOX_TOKEN,
          limit: 1,
        },
      });
      address = geoRes.data.features[0]?.place_name || null;
    }

    // Upload avatar to Cloudinary
    let avatarUrl = null;
    if (avatar) {
      const upload = await cloudinary.uploader.upload(avatar, {
        folder: "users/avatars",
        transformation: [{ width: 300, height: 300, crop: "fill" }],
      });
      avatarUrl = upload.secure_url;
    }

    // Update user
    user.fullName = fullName;
    if (avatarUrl) user.avatar = avatarUrl;
    if (latitude && longitude) {
      user.location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };
    }
    user.address = address;
    user.isVerified = true;

    await user.save();

    return res.json({
      success: true,
      user,
      token: generateToken(user._id),
      message: "Profile completed successfully",
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    // user already attached by middleware
    if (!req.user) {
      return res.status(400).json({ message: "User not found" });
    }
    res.json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.editprofile = async (req, res) => {
  try {
    const userId = req.userId;
    const { fullName, latitude, longitude, avatar } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    if (fullName) {
      user.fullName = fullName;
    }
    if (latitude && longitude) {
      user.location = {
        type: "Point",
        coordinates: [longitude, latitude]
      };
    }
    if (avatar) {
      const uploadResult = await cloudinary.uploader.upload(avatar, {
        folder: "user/avatars",
        transformation: [{ width: 300, height: 300, crop: "fill" }]
      })
      user.avatar = uploadResult.secure_url;
    }
    await user.save();

    res.json({
      message: "profile updated",
      success: true,
      user,
    });
  } catch (err) {
    console.error("edit profile controller error", err.message);
    res.status(500).json({ message: err.message });
  }
}