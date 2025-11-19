const razorpay = require("../config/razorpay");
const Transaction = require("../models/transaction.model");
const crypto = require('crypto');
const Wallet = require("../models/wallet.model");
require('dotenv').config();

//Added the money in the wallet
exports.addMoneyWallet = async (req, res) => {
    try {
        const empId = req.employee._id;
        const empType = req.employee.constructor.modelName;
        if (!empId || !empType) {
            return res.status(400).json({ message: "EmpId and Emp role is needed" });
        }
        const { amount } = req.body;
        if (!amount) {
            return res.status(400).json({ message: "Amount is required" });
        }
        const order = await razorpay.orders.create({
            amount: amount * 100,//paise
            currency: "INR",
            receipt: "wallet_" + Date.now()
        });
        await Transaction.create({
            empId,
            empType,
            amount,
            transactionType: "ADD",
            transactionStatus: "PENDING",
            razorpayOrderId: order.id
        });
        res.json({
            key: process.env.RZP_KEY_ID,
            orderId: order.id,
            amount,
        });
    }
    catch (err) {
        console.error("Transaction controller error", err.message);
        res.status(500).json({ message: "Failed", error: err.message });
    }
}

//verify the order

exports.verifyAddMoney = async (req, res) => {
    try {
        const empId = req.employee._id;
        const empType = req.employee.constructor.modelName;
        if (!empId || !empType) {
            return res.status(400).json({ message: "EmpId and Emp role is needed" });
        }
        const { orderId, paymentId, signature } = req.body;
        const body = orderId + "|" + paymentId;
        const expectedsignature = crypto
            .createHmac("sha256", process.env.RZ_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedsignature != signature) {
            return res.status(400).json({ message: "Invalid signature" });
        }

        const tx = await Transaction.findOne({ razorpayOrderId: orderId });
        tx.transactionStatus = "SUCCESS";
        tx.razorpayPaymentId = paymentId;
        await tx.save();
        let wallet = await Wallet.findOne({ empId, empType });
        if (!wallet) {
            wallet = await wallet.create({ empId, empType });
        }
        wallet.balance += tx.amount;
        await wallet.save();
        res.json({
            message: "Money added Successfully",
            newBalance: wallet.balance,
        });
    } catch (err) {
        console.error("verify order controller error", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
}


exports.withdrawMoney = async (req, res) => {
    try {
        const empId = req.employee._id;
        const empType = req.employee.constructor.modelName;
        const { amount } = req.body;
        if (!amount) {
            return res.status(400).json({ message: "Amount is required" });
        }
        const wallet = await Wallet.findOne({ empId, empType });
        if (!wallet) {
            return res.status(400).json({ message: "Wallet not found" });
        }
        if (wallet.balance < amount) {
            return res.status(500).json({ message: "Insufficient balance" });
        }
        wallet.balance -= amount;
        await wallet.save();

        await Transaction.create({
            empId,
            empType,
            amount,
            transactionType: "WITHDRAW",
            transactionStatus: "SUCCESS",
        });
        res.json({
            message: "Withdraw Successfully",
            newBalance: wallet.balance,
        })
    }
    catch (err) {
        console.error("Withdraw Money controller error", err.message);
        res.status(500).json({ mesage: "server error", error: err.message });
    }
}

exports.getWalletBalance = async (req, res) => {
    const empId = req.employee._id;
    const empType = req.employee.constructor.modelName;
    const wallet = await Wallet.findOne({ empId, empType });

    res.json({
        balance: wallet ? wallet.balance : 0
    });
};

exports.getRecentTransactions = async (req, res) => {
    const empId = req.employee._id;
    const empType = req.employee.constructor.modelName;
    const tx = await Transaction.find({ empId, empType })
    .sort({ createdAt: -1 })
    .limit(30);

    res.json(tx);
};
