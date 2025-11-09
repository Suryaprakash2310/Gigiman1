const express = require("express");
const router = express.Router();

const {
  sendOtp,
  verifyOtp,
  ShowServices,
  searchService,
  showCategories,
  showParts,
  searchDomain,
  searchParts,
  addEmployeeService,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

//  OTP Login (common to SingleEmployee / MultipleEmployee / ToolShop)
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);

//  Show service list
router.get("/services", ShowServices);

//  Search services by name
router.get("/services/search", searchService);
//Added the service for employee

router.post("/add-service",protect,addEmployeeService);
//  Show categories (domain list) - only after job created
router.get("/parts/categories", showCategories);

//  Show parts for a selected category
router.get("/parts", showParts);

//  Search domain (first page search)
router.get("/parts/search-domain", searchDomain);

//  Search parts inside selected domain (second page search)
router.get("/parts/search", searchParts);

module.exports = router;
