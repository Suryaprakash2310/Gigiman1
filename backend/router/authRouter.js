const express = require("express");
const router = express.Router();
const { sendOtp, verifyOtp } = require("../controllers/authController");

// Step 1: Send OTP
router.post("/send-otp", sendOtp);

// Step 2: Verify OTP
router.post("/verify-otp", verifyOtp);

module.exports = router;
