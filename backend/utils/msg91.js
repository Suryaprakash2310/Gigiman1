const axios = require('axios');
require('dotenv').config();

const sendOtpMsg91 = async (phoneNo, otp) => {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    console.warn("MSG91 credentials missing. Skipping SMS send.");
    return { success: false, message: "MSG91 credentials missing" };
  }

  try {
    const response = await axios.get('https://api.msg91.com/api/v5/otp', {
      params: {
        template_id: templateId,
        mobile: phoneNo,
        authkey: authKey,
        otp: otp
      }
    });

    if (response.data.type === 'success') {
      console.log(`MSG91: OTP sent successfully to ${phoneNo}`);
      return { success: true, data: response.data };
    } else {
      console.error(`MSG91 Error: ${JSON.stringify(response.data)}`);
      return { success: false, data: response.data };
    }
  } catch (error) {
    console.error(`MSG91 Request Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

module.exports = { sendOtpMsg91 };
