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

const upload = require("../middleware/upload.middleware");

// Manage banners (Permissions: Admin bypass, others need 'banner' permission)
router.post("/create", protect, hasPermission("banner"), upload.single('image'), createBanner);
router.put("/:id", protect, hasPermission("banner"), upload.single('image'), updateBanner);
router.delete("/:id", protect, hasPermission("banner"), deleteBanner);

// View banners
router.get("/", getAllBanners);
router.get("/:id", getSingleBanner);

module.exports = router;
