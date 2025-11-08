const express = require("express");
const router = express.Router();

const {
  sendOtp,
  verifyOtp,
  ShowServices,
  searchService,
  showParts,
  searchparts
} = require("../controllers/publicController");

//  OTP Routes
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

//  Service Routes
router.get("/services", ShowServices);       // Show all services
router.get("/services/search", searchService); // Search services

//  Parts Routes
router.get("/parts", showParts);              // Show all parts (only after job created)
router.get("/parts/search", searchparts);     // Search parts by name

module.exports = router;
