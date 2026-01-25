const { maskPhone, normalizePhone } = require("../utils/crypto");
const User = require('../models/user.model');
const Otp = require('../models/otp.model')
const jwt = require("jsonwebtoken");
const axios = require("axios");
const cloudinary = require('../config/cloudinary');
const generateTempToken = require("../utils/generateTempToken");
const AppError = require("../utils/AppError");
require('dotenv').config();
//token generation
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

//Send-otp always
exports.sendOtp = async (req, res, next) => {
  try {
    const { phoneNo } = req.body;

    if (!phoneNo) {
      return next(new AppError("Phone number required", 400));
    }

    const cleanPhone = normalizePhone(phoneNo);

    // Ensure user exists (temporary user)
    let user = await User.findOne({ phoneNo });

    if (!user) {
      user = await User.create({
        phoneNo,
        phoneMasked: maskPhone(phoneNo),
        isVerified: false,
      });
    }

    const existingOtp = await Otp.findOne({ cleanPhone });

    // Block if OTP still valid
    if (existingOtp && existingOtp.expiresAt > new Date()) {
      return next(new AppError("An active OTP has already been sent. Please wait before requesting a new one.", 429));
    }

    // Max resend limit
    if (existingOtp && existingOtp.resendCount >= 3) {
      return next(new AppError("Maximum OTP resend limit reached. Try again later.", 429));
    }

    const otp = Math.floor(1000 + Math.random() * 9000);

    await Otp.findOneAndUpdate(
      { cleanPhone },
      {
        otp,
        attempts: 0,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins
        $inc: { resendCount: 1 },
      },
      { upsert: true, new: true }
    );

    console.log("OTP sent:", otp); // replace with SMS API

    return res.json({
      success: true,
      message: "OTP sent",
      otp,
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


//verify otp
exports.verifyOtp = async (req, res, next) => {
  try {
    const { phoneNo, otp } = req.body;

    if (!phoneNo || !otp) {
      return next(new AppError("Phone number and OTP required", 400));
    }

    const cleanPhone = normalizePhone(phoneNo);

    const otpDoc = await Otp.findOne({ cleanPhone });
    if (!otpDoc) {
      return next(new AppError("OTP expired or not found", 400));
    }

    // OTP expired
    if (new Date() > otpDoc.expiresAt) {
      await Otp.deleteOne({ cleanPhone });
      return next(new AppError("OTP expired. Please request a new one.", 400));
    }

    // OTP mismatch
    if (otpDoc.otp.toString() !== otp.toString()) {
      otpDoc.attempts += 1;

      if (otpDoc.attempts >= 5) {
        await Otp.deleteOne({ cleanPhone });
        return next(new AppError("Maximum OTP attempts exceeded. Please request a new OTP.", 400));
      }

      await otpDoc.save();
      return next(new AppError("Invalid OTP. Please try again.", 400));
    }

    // OTP verified → delete OTP
    await Otp.deleteOne({ cleanPhone });

    const user = await User.findOne({ phoneNo });
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    user.isVerified = true;
    await user.save();

    // New user → complete profile
    if (!user.fullName) {
      return res.json({
        success: true,
        next: "COMPLETE_PROFILE",
        tempToken: generateTempToken(user._id),
      });
    }

    // Existing user
    return res.json({
      success: true,
      token: generateToken(user._id),
      user,
      message: "Login successful",
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

//complete profile registeration
exports.completeProfile = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { fullName, latitude, longitude, avatar } = req.body;

    if (!userId || !fullName) {
      return next(new AppError("User ID and full name are required", 400));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("User not found", 404));
    }
    const MAP_BOX_TOKEN = process.env.MAP_BOX_TOKEN;

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
    const finalToken = generateToken(user._id);

    await user.save();

    return res.json({
      success: true,
      user,
      token: finalToken,
      message: "Profile completed successfully",
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    // user already attached by middleware
    if (!req.user) {
      return next(new AppError("User not found", 404));
    }
    res.json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.editprofile = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { fullName, latitude, longitude, avatar } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError("User not found", 404));
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
    next(err); //let Global error handler deal with it
  }
}