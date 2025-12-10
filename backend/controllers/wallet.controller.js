const razorpay = require("../config/razorpay");
const Transaction = require("../models/transaction.model");
const crypto = require('crypto');
const Wallet = require("../models/wallet.model");
const ROLES = require("../enum/role.enum");
const roleModelMap = require("../utils/roleModelMap");
require('dotenv').config();

//Add money in the wallet
exports.addMoneyWallet = async (req, res) => {
    try {
        const empId = req.employee._id;
        const empType = roleModelMap[req.employee.role];
        if (!empId || !empType) {
            return res.status(400).json({ message: "Invalid emp type or model" });
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
            key: process.env.RZ_KEY_ID,
            orderId: order.id,
            amount,
        });
    }
    catch (err) {
        console.error("Transaction controller error", err.message);
        res.status(500).json({ message: "Failed", error: err.message });
    }
}

//verify payment
exports.verifyAddMoney = async (req, res) => {
    try {
        const empId = req.employee._id;
        const empType = roleModelMap[req.employee.role];
        if (!empId || !empType) {
            return res.status(400).json({ message: "Invalid emp type or model" });
        }
        const { orderId, paymentId, signature } = req.body;
        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({ message: "orderId,paymentId,signature is required" });
        }
        const body = `${orderId}|${paymentId}`;
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
            wallet = await Wallet.create({ empId, empType });
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
        const empType = roleModelMap[req.employee.role];
        if (!empId || !empType) {
            return res.status(400).json({ message: "EmpId and Emp role is needed" });
        }
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
    try {
        const empId = req.employee._id;
        const empType = roleModelMap[req.employee.role];

        if (!empId || !empType) {
            return res.status(400).json({ message: "Invalid employee type" });
        }

        const wallet = await Wallet.findOne({ empId, empType });

        res.json({
            balance: wallet ? wallet.balance : 0
        });

    } catch (err) {
        console.error("getWalletBalance ERROR:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};



exports.getRecentTransactions = async (req, res) => {
    try {
        const empId = req.employee._id;
        const empType = roleModelMap[req.employee.role];

        if (!empId || !empType) {
            return res.status(400).json({ message: "Invalid employee type" });
        }

        const tx = await Transaction.find({ empId, empType })
            .sort({ createdAt: -1 })
            .limit(30);

        res.json(tx);

    } catch (err) {
        console.error("getRecentTransactions ERROR:", err.message);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};