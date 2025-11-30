const express=require('express');
const { register, sendOtp, verifyOtp, getProfile } = require('../controllers/user.controller');
const { userProtect } = require('../middleware/user.middleware');

const router=express.Router();

router.post("/register",register);

router.post("/send-otp",sendOtp);
router.post("/verify-otp",verifyOtp);
router.get("/profile",userProtect,getProfile);

module.exports=router;