const axios = require("axios");

const sendOTP = async (phoneNo, otp) => {
  try {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {
      console.warn("MSG91_AUTH_KEY or MSG91_TEMPLATE_ID is not configured. Skipping SMS sending.");
      return null;
    }

    const mobile = `91${phoneNo}`;

    // MSG91 Send OTP API endpoint
    const url = `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=${mobile}&authkey=${authKey}&otp=${otp}`;

    const response = await axios.post(url);
    
    console.log(`MSG91 Response for ${mobile}:`, response.data);
    return response.data;
  } catch (error) {
    console.error("Error sending OTP via MSG91:", error?.response?.data || error.message);
    // Depending on logic, you may want to throw an error or handle it silently
    // throw new Error("Failed to send SMS OTP");
  }
};

module.exports = {
  sendOTP,
};
