const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");
const { addMoneyWallet, verifyAddMoney, withdrawMoney, getWalletBalance, getRecentTransactions } = require("../controllers/wallet.controller");

// Add money
router.post("/add-money", protect, addMoneyWallet);

// Verify Razorpay
router.post("/verify", protect, verifyAddMoney);

// Withdraw
router.post("/withdraw", protect,withdrawMoney);

// Wallet balance
router.get("/balance", protect, getWalletBalance);

// Recent transactions
router.get("/recenttransactions", protect, getRecentTransactions);

module.exports = router;
