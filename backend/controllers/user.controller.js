const { encryptPhone, maskPhone, hashPhone } = require("../utils/crypto");
const User = require('../models/user.model');
const jwt = require("jsonwebtoken");
const axios = require("axios");
const cloudinary=require('../config/cloudinary')

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
    let user = await User.findOne({ phoneHash });

    // Create temp user if not exists
    if (!user) {
      user = await User.create({
        phoneNo: encryptPhone(phoneNo),
        phoneMasked: maskPhone(phoneNo),
        phoneHash,
        isVerified: false,
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000);

    user.otp = otp;
    user.expiresAt = Date.now() + 5 * 60 * 1000;
    await user.save();

    console.log("OTP sent:", otp); // replace with SMS API

    res.json({ success: true, message: "OTP sent" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
//verify otp
exports.verifyOtp = async (req, res) => {
  try {
    const { phoneNo, otp } = req.body;

    const phoneHash = hashPhone(phoneNo);
    const user = await User.findOne({ phoneHash });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.otp = null;
    user.expiresAt = null;
    user.isVerified = true;
    await user.save();

    // NEW USER → profile incomplete
    if (!user.fullName) {
      return res.json({
        success: true,
        next: "COMPLETE_PROFILE",
        userId: user._id,
      });
    }

    // EXISTING USER → LOGIN
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

exports.editprofile=async(req,res)=>{
  try{
    const userId=req.user.id;
    const{fullName,latitude,longtitude,avatar}=req.body;
    const user=await User.findById(userId);
    if(!user){
      return res.status(400).json({message:"User not found"});
    }
    if(fullName){
      user.fullName=fullName;
    }
    if(latitude&& longtitude){
      user.location={ 
        type:"Point",
        coordinates:[longtitude,latitude]
      };
    }
    if(avatar){
      const uploadResult=await cloudinary.uploader.upload(avatar,{
        floder:"user/avatars",
        transformation:[{widht:300,height:300,crops:"fill"}]
      })
      user.avatar=uploadResult.secure_url;
    }
    await user.save();
    
    res.json({
      message:"profile updated",
      success:true,
      user,
    });
  }catch(err){
    console.error("edit profile controller error",err.message);
    res.status(500).json({message:err.message});
  }
}