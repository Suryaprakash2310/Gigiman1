const express=require('express');
const { completeProfile, sendOtp, verifyOtp, getProfile, editprofile } = require('../controllers/user.controller');
const { userProtect } = require('../middleware/user.middleware');
const { tempProtect } = require('../middleware/temp.middleware');

const router=express.Router();

router.post("/register",tempProtect,completeProfile);

router.post("/send-otp",sendOtp);
router.post("/verify-otp",verifyOtp);
router.get("/profile",userProtect,getProfile);
router.patch("/edit-profile", userProtect, editprofile);


module.exports=router;