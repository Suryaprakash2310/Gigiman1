const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');
const { protect } = require('../middleware/auth.middleware');
const { hasPermission } = require('../middleware/role.middleware');
const PERMISSIONS = require('../enum/permission.enum');

// Need admin auth middleware typically
router.post('/', protect, hasPermission(PERMISSIONS.MANAGE_COUPONS), couponController.createCoupon); // Admin create
router.get('/', protect, hasPermission(PERMISSIONS.MANAGE_COUPONS), couponController.getCoupons); // Admin get all
router.put('/:id', protect, hasPermission(PERMISSIONS.MANAGE_COUPONS), couponController.updateCoupon); // Admin update
router.post('/validate', couponController.validateCoupon); // User validate

module.exports = router;
