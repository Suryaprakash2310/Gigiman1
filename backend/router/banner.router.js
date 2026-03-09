const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const { hasPermission, allowRoles } = require("../middleware/role.middleware");
const ROLES = require("../enum/role.enum");

const {
    createBanner,
    deleteBanner,
    updateBanner,
    getAllBanners,
    getSingleBanner
} = require("../controllers/banner.controller");

// Apply protection to all banner routes
router.use(protect);

// Manage banners (Permissions: Admin bypass, others need 'banner' permission)
router.post("/create", hasPermission("banner"), createBanner);
router.put("/:id", hasPermission("banner"), updateBanner);
router.delete("/:id", hasPermission("banner"), deleteBanner);

// View banners
router.get("/", getAllBanners);
router.get("/:id", getSingleBanner);

module.exports = router;
