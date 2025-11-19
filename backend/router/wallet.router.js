const express = require("express");
const router = express.Router();
const walletCtrl = require("../controllers/wallet.controller");
const { protect } = require("../middleware/auth.middleware");

// Add money
router.post("/add-money", protect, walletCtrl.addMoneyWallet);

// Verify Razorpay
router.post("/verify", protect, walletCtrl.verifyAddMoney);

// Withdraw
router.post("/withdraw", protect, walletCtrl.withdrawMoney);

// Wallet balance
router.get("/balance", protect, walletCtrl.getWalletBalance);

// Recent transactions
router.get("/transactions", protect, walletCtrl.getRecentTransactions);

module.exports = router;
