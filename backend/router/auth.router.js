const express = require("express");
const router = express.Router();

const {
  sendOtp,
  verifyOtp,
  ShowServices,
  searchService,
} = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");

//  OTP Login (common to SingleEmployee / MultipleEmployee / ToolShop)
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

//  Show service list
router.get("/services", ShowServices);

//  Search services by name
router.get("/services/search", searchService);

module.exports = router;
