const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { getCommissionStatus, payCommission, verifyCommissionPayment } = require('../controllers/commission.controller');

// Commission Management for Servicers
router.get("/status", protect, getCommissionStatus);
router.post("/recharge", protect, payCommission);
router.post("/verify-payment", protect, verifyCommissionPayment);

module.exports = router;
