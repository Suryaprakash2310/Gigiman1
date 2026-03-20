const axios = require("axios");
require("dotenv").config();

// MSG91 API configuration
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

/**
 * Send OTP via MSG91
 * @param {string} phoneNo - Normalized phone number (e.g., +919999999999)
 * @param {number|string} otp - The OTP to send
 * @returns {Promise}
 */
exports.sendOtp = async (phoneNo, otp) => {
  try {
    // Remove '+' for MSG91
    const mobile = phoneNo.replace("+", "");

    const options = {
      method: "POST",
      url: "https://control.msg91.com/api/v5/otp",
      params: {
        template_id: MSG91_TEMPLATE_ID,
        mobile: mobile,
        authkey: MSG91_AUTH_KEY,
        otp: otp,
      },
      headers: {
        "Content-Type": "application/json",
      },
    };

    const response = await axios.request(options);
    return response.data;
  } catch (error) {
    console.error("MSG91 Error:", error.response?.data || error.message);
    throw new Error("Failed to send SMS via MSG91");
  }
};

/**
 * Verify OTP via MSG91 (Optional - if using MSG91 verification API)
 * Usually, we verify in our own DB using properties from user.controller.js
 */
exports.verifyOtp = async (phoneNo, otp) => {
  try {
    const mobile = phoneNo.replace("+", "");
    const options = {
      method: "GET",
      url: "https://control.msg91.com/api/v5/otp/verify",
      params: {
        authkey: MSG91_AUTH_KEY,
        mobile: mobile,
        otp: otp,
      },
    };

    const response = await axios.request(options);
    return response.data;
  } catch (error) {
    console.error("MSG91 Verify Error:", error.response?.data || error.message);
    return { type: "error", message: "Verification failed" };
  }
};
