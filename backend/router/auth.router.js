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
const { protect } = require("../middleware/auth.middleware");

//  OTP Login (common to SingleEmplkoyee / MultipleEmployee / ToolShop)
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

//  Show service list
router.get("/services", ShowServices);

//  Search services by name
router.get("/services/search", searchService);

// Get all the subservices
router.get("/sub-service",ShowsubserviceId);

//Get all services
router.get("/showServices", ShowsubService);


router.get("/showsubservice/:domainServiceId",ShowsubserviceId);

// Get service category by ID
router.get("/service-list/:domainServiceId",getServiceCategoryById)


module.exports = router;
