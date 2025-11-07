const express = require("express");
const router = express.Router();
const { sendOtp, verifyOtp, ShowSerives, ShowServices } = require("../controllers/authController");

// Step 1: Send OTP
router.post("/send-otp", sendOtp);

// Step 2: Verify OTP
router.post("/verify-otp", verifyOtp);

//show the all services to the All employees

router.get("/services",ShowServices);

module.exports = router;
