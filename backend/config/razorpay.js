const Razorpay=require('razorpay');
require('dotenv').config();
const Booking=require('../models/Booking.model');
const crypto = require("crypto");  
const { PAYMENT_STATUS } = require('../utils/constants');

// Initialize Razorpay instance
const razorpay=new Razorpay({
    key_id:process.env.RZ_KEY_ID,
    key_secret:process.env.RZ_KEY_SECRET,
})
//createOrder 
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
    await Booking.findByIdAndUpdate(bookingId, {
        razorpayOrderId: order.id,
        paymentStatus: PAYMENT_STATUS.PENDING,
    });

    return order;
};


// Verify Razorpay Payment Signature
exports.verifyPayment = async ({
    bookingId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
}) => {
    //create signature
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    //hashing
    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");
    //comparing signatures
    const isValid = expectedSignature === razorpaySignature;
    //if not valid
    if (!isValid) return { success: false };
    //if valid update booking
    const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            paymentStatus: PAYMENT_STATUS.PAID,
        },
        { new: true }
    );
    return { success: true, booking };
};


module.exports=razorpay;