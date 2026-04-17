const razorpay = require("../config/razorpay");
const Transaction = require("../models/transaction.model");
const crypto = require('crypto');
const Wallet = require("../models/wallet.model");
const roleModelMap = require("../utils/roleModelMap");
const TRANSACTION_TYPE = require("../enum/transaction.enum");
const TRANSACTION_STATUS = require("../enum/transactiontype.enum");
const AppError = require("../utils/AppError");
require('dotenv').config();

//Add money in the wallet
exports.addMoneyWallet = async (req, res, next) => {
    try {
        const empId = req.employee._id;
        const empType = req.role;
        const empModel = roleModelMap[empType];
        if (!empId || !empType || !empModel) {
            return next(new AppError("Invalid emp type or model", 400));
        }
        const { amount } = req.body;
        if (!amount) {
            return next(new AppError("Amount is required", 400));
        }
        const order = await razorpay.orders.create({
            amount: amount * 100,//paise
            currency: "INR",
            receipt: "wallet_" + Date.now()
        });
        await Transaction.create({
            empId,
            empType,
            empModel,
            amount,
            transactionType: TRANSACTION_TYPE.ADD,
            transactionStatus: TRANSACTION_STATUS.PENDING,
            razorpayOrderId: order.id
        });
        res.json({
            key: process.env.RZ_KEY_ID,
            orderId: order.id,
            amount,
        });
    }
    catch (err) {
        next(err); //let Global error handler deal with it
    }
}

//verify payment
exports.verifyAddMoney = async (req, res, next) => {
    try {
        const empId = req.employee._id;
        const empType = req.role;
        const empModel = roleModelMap[empType];
        if (!empId || !empType || !empModel) {
            return next(new AppError("Invalid emp type or model", 400));
        }
        const { orderId, paymentId, signature } = req.body;
        if (!orderId || !paymentId || !signature) {
            return next(new AppError("orderId,paymentId,signature is required", 400));
        }
        const body = `${orderId}|${paymentId}`;
        const expectedsignature = crypto
            .createHmac("sha256", process.env.RZ_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedsignature != signature) {
            return next(new AppError("Invalid signature", 400));
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
        next(err); //let Global error handler deal with it
    }
}


exports.withdrawMoney = async (req, res, next) => {
    try {
        const empId = req.employee._id;
        const empType = req.role;
        const empModel = roleModelMap[empType]
        if (!empId || !empType || !empModel) {
            return next(new AppError("Invalid emp type or model", 400));
        }
        const { amount } = req.body;
        if (!amount) {
            return next(new AppError("Amount is required", 400));
        }
        const wallet = await Wallet.findOne({ empId, empType });
        if (!wallet) {
            return next(new AppError("Wallet not found", 400));
        }
        if (wallet.balance < amount) {
            return next(new AppError("Insufficient balance", 500));
        }
        wallet.balance -= amount;
        await wallet.save();

        await Transaction.create({
            empId,
            empType,
            empModel,
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
        next(err); //let Global error handler deal with it
    }
}

exports.getWalletBalance = async (req, res, next) => {
    try {
        const empId = req.employee._id;
        const empType = req.role;
        if (!empId || !empType) {
            return next(new AppError("EmpId and Emp role is needed", 400));
        }
        const wallet = await Wallet.findOne({ empId, empType });

        res.json({
            balance: wallet ? wallet.balance : 0
        });
    }
    catch (err) {
        next(err); //let Global error handler deal with it
    }
};

exports.getRecentTransactions = async (req, res, next) => {
    try {
        const empId = req.employee._id;
        const empType = req.role;
        const empModel = roleModelMap[empType];

        if (!empId || !empType || !empModel) {
            return next(new AppError("EmpId and Emp role is needed", 400));
        }

        const tx = await Transaction.find({ empId, empModel })
            .sort({ createdAt: -1 })
            .limit(30);

        res.json(tx);
    } catch (err) {
        next(err); //let Global error handler deal with it
    }
};
