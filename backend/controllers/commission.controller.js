const Commission = require("../models/commissionwallet.model.js");
const { createOrder, verifyRazorpaySignature } = require("../transaction/razorpay.config.js");
const AppError = require("../utils/AppError");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ROLES = require("../enum/role.enum");
const mongoose = require("mongoose");

/**
 * Get current unpaid commission status for the logged-in servicer
 */
exports.getCommissionStatus = async (req, res, next) => {
    try {
        const empId = req.employee.id;
        const empType = req.employee.role;

        // 1. Get unpaid commission total
        const unpaidData = await Commission.aggregate([
            { $match: { empId: new mongoose.Types.ObjectId(empId), status: { $ne: 'PAID' } } },
            { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
        ]);
        
        const totalUnpaid = unpaidData[0]?.total || 0;

        // 2. Get actual blocking status from the employee record
        let employeeDoc;
        if (empType === ROLES.SINGLE_EMPLOYEE) {
            employeeDoc = await SingleEmployee.findById(empId).select("isBlocked");
        } else {
            employeeDoc = await MultipleEmployee.findById(empId).select("isBlocked");
        }

        const isActuallyBlocked = employeeDoc?.isBlocked || false;
        
        res.status(200).json({
            success: true,
            totalUnpaid,
            isBlocked: isActuallyBlocked,
            threshold: 1000,
            message: isActuallyBlocked ? "You are blocked due to outstanding commission. Please pay to resume services." : "Your commission balance is within limits."
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Create a Razorpay order for commission payment
 */
exports.payCommission = async (req, res, next) => {
    try {
        const empId = req.employee.id;
        
        // Calculate the full outstanding debt automatically
        const commissionWallet = await Commission.find({ 
            empId: new mongoose.Types.ObjectId(empId), 
            status: { $ne: 'PAID' } 
        });
        
        const totalUnpaid = commissionWallet.reduce((sum, comm) => {
            return sum + (comm.commissionAmount || 0) - (comm.paidAmount || 0);
        }, 0);

        // Servicer pays full amount - no need to get amount from request body
        const amount = totalUnpaid;

        if (amount <= 0) {
            return next(new AppError("No outstanding commission to pay", 400));
        }

        // Create Razorpay order specifically for the full debt
        const orderIdPrefix = `comm_${empId.toString().substring(0, 10)}`;
        const order = await createOrder(orderIdPrefix, Math.round(amount));

        res.status(200).json({
            success: true,
            fullAmountToPay: amount,
            order
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Verify commission payment and update commission records
 */
exports.verifyCommissionPayment = async (req, res, next) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, amount } = req.body;
        const empId = req.employee.id;
        const empType = req.employee.role;

        // Verify signature
        const isValid = verifyRazorpaySignature({
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature
        });

        if (!isValid) {
            return next(new AppError("Payment verification failed", 400));
        }

        // Update commissions as paid (oldest first logic)
        let amountLeft = Number(amount);
        const unpaidCommissions = await Commission.find({ 
            empId: new mongoose.Types.ObjectId(empId), 
            status: { $ne: 'PAID' } 
        }).sort({ createdAt: 1 });

        for (const comm of unpaidCommissions) {
            if (amountLeft <= 0) break;
            
            const due = (comm.commissionAmount || 0) - (comm.paidAmount || 0);
            if (amountLeft >= due) {
                comm.paidAmount = comm.commissionAmount;
                comm.status = 'PAID';
                amountLeft -= due;
            } else {
                comm.paidAmount = (comm.paidAmount || 0) + amountLeft;
                comm.status = 'PARTIAL';
                amountLeft = 0;
            }
            await comm.save();
        }

        // Check if we should unblock the servicer now
        const unpaidDataAfter = await Commission.aggregate([
            { $match: { empId: new mongoose.Types.ObjectId(empId), status: { $ne: 'PAID' } } },
            { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
        ]);
        
        const totalUnpaidAfter = unpaidDataAfter[0]?.total || 0;
        
        if (totalUnpaidAfter < 1000) {
            // Unblock
            if (empType === ROLES.SINGLE_EMPLOYEE) {
                await SingleEmployee.findByIdAndUpdate(empId, { isBlocked: false, isActive: true });
            } else if (empType === ROLES.MULTIPLE_EMPLOYEE) {
                await MultipleEmployee.findByIdAndUpdate(empId, { isBlocked: false, isActive: true });
            }
        }

        res.status(200).json({
            success: true,
            message: "Payment successful. Your commission balance has been updated.",
            currentUnpaid: totalUnpaidAfter,
            isBlocked: totalUnpaidAfter >= 1000
        });
    } catch (err) {
        next(err);
    }
};
