const express = require("express");
const router = express.Router();

const {
  sendOtp,
  verifyOtp,
  ShowServices,
  searchService,
  ShowsubserviceId,
  ShowsubService,
  getServiceCategoryById,
} = require("../controllers/auth.controller");

// OTP
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

// Domain services
router.get("/services", ShowServices);
router.get("/services/search", searchService);

// Subservices by domain
router.get("/showsubservice/:domainServiceId", ShowsubserviceId);

// All services + categories 
router.get("/showServices", ShowsubService);

// Single category
router.get("/service-list/:serviceCategoryId", getServiceCategoryById);

module.exports = router;
