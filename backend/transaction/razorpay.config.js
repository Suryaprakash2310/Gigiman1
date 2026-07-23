const Booking= require('../models/Booking.model');
const PAYMENT_STATUS=require('../enum/payment.enum');
const razorpay = require('../config/razorpay');   // ✅ REQUIRED
const crypto = require('crypto');  
exports.createOrder = async (bookingId, amount) => {
    //create Razorpay order
    const options = {
        amount: amount * 100,       // Convert to paise
        currency: "INR",
        receipt: `booking_${bookingId}`,
    };
    //create order
    const order = await razorpay.orders.create(options);
    //update booking with orderId and payment status
    if (bookingId && !bookingId.toString().startsWith("comm_")) {
        const booking = await Booking.findById(bookingId);
        if (booking) {
            booking.razorpayOrderId = order.id;
            if (booking.paymentStatus !== PAYMENT_STATUS.PARTIALLY_PAID) {
                booking.paymentStatus = PAYMENT_STATUS.PENDING;
            }
            await booking.save();
        }
    }

    return order;
};


// Verify Razorpay Payment Signature
exports.verifyRazorpaySignature = ({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
}) => {
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
        .createHmac("sha256", process.env.RZ_KEY_SECRET)
        .update(body.toString())
        .digest("hex");
    return expectedSignature === razorpaySignature;
};

exports.verifyPayment = async ({
    bookingId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
}) => {
    const isValid = exports.verifyRazorpaySignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
    });

    if (!isValid) return { success: false };

    // If it's a booking payment (not a commission payment starting with comm_)
    if (bookingId && !bookingId.startsWith('comm_')) {
        const booking = await Booking.findById(bookingId);
        if (!booking) return { success: false };

        booking.razorpayOrderId = razorpayOrderId;
        booking.razorpayPaymentId = razorpayPaymentId;
        booking.razorpaySignature = razorpaySignature;

        if (booking.paymentStatus === PAYMENT_STATUS.PENDING) {
            if (booking.paymentType === "ADVANCE") {
                booking.paymentStatus = PAYMENT_STATUS.PARTIALLY_PAID || "partially_paid";
            } else {
                booking.paymentStatus = PAYMENT_STATUS.PAID;
                booking.remainingAmount = 0;
            }
        } else {
            booking.paymentStatus = PAYMENT_STATUS.PAID;
            booking.remainingAmount = 0;
        }

        await booking.save();
        return { success: true, booking };
    }
    
    return { success: true };
};

