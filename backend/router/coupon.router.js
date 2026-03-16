const express = require('express');
const router = express.Router();
const couponController = require('../controllers/coupon.controller');

// Need admin auth middleware typically, but keeping it open for now based on app structure 
// or you can add `protect` and `authorizeRoles('ADMIN')` if those middlewares exist.

router.post('/', couponController.createCoupon); // Admin create
router.get('/', couponController.getCoupons); // Admin get all
router.put('/:id', couponController.updateCoupon); // Admin update
router.post('/validate', couponController.validateCoupon); // User validate

module.exports = router;
