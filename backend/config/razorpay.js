const Razorpay=require('razorpay');
require('dotenv').config();

const razorpay=new Razorpay({
    key_id:process.env.RZ_KEY_ID,
    key_secret:process.env.RZ_KEY_SECRET,
})
exports.createOrder = async (bookingId, amount) => {
    const options = {
        amount: amount * 100,       // Convert to paise
        currency: "INR",
        receipt: `booking_${bookingId}`,
    };

    const order = await razorpay.orders.create(options);

    await Booking.findByIdAndUpdate(bookingId, {
        razorpayOrderId: order.id,
        paymentStatus: PAYMENT_STATUS.PENDING,
    });

    return order;
};


/**
 * Verify Razorpay Payment Signature
 */
exports.verifyPayment = async ({
    bookingId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
}) => {

    const body = razorpayOrderId + "|" + razorpayPaymentId;

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

    const isValid = expectedSignature === razorpaySignature;

    if (!isValid) return { success: false };

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