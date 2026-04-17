const axios = require("axios");
const AppError = require("./AppError");

/**
 * Initiates a masked call between two numbers using Exotel
 * @param {string} from - The initiator's phone number (The first person to receive the call)
 * @param {string} to - The receiver's phone number (The second person to receive the call)
 * @returns {Promise<Object>} - The Exotel API response
 */
const makeMaskedCall = async (from, to) => {
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;
  const apiKey = process.env.EXOTEL_API_KEY;
  const apiToken = process.env.EXOTEL_API_TOKEN;
  const callerId = process.env.EXOTEL_CALLER_ID; // Your Exotel Virtual Number

  if (!accountSid || !apiKey || !apiToken || !callerId) {
    throw new AppError("Exotel configuration is missing in environment variables", 500);
  }

  const auth = Buffer.from(`${apiKey}:${apiToken}`).toString("base64");
  const url = `https://api.exotel.com/v1/Accounts/${accountSid}/Calls/connect.json`;

  try {
    const response = await axios.post(
      url,
      new URLSearchParams({
        From: from,
        To: to,
        CallerId: callerId,
        Record: "true", // Optional: record the call
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Exotel Call Error:", error.response?.data || error.message);
    throw new AppError(
      error.response?.data?.RestException?.Message || "Failed to initiate masked call",
      error.response?.status || 500
    );
  }
};

module.exports = { makeMaskedCall };
