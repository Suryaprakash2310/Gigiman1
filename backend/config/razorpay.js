const Razorpay=require('razorpay');
require('dotenv').config();


// Initialize Razorpay instance
const razorpay=new Razorpay({
    key_id:process.env.RZ_KEY_ID,
    key_secret:process.env.RZ_KEY_SECRET,
})

module.exports=razorpay;