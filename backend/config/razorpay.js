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

module.exports=razorpay;