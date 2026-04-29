const axios = require("axios");

async function sendWhatsAppMessage(to, message) {
  try {
    const phoneNumberId =
      process.env.PHONE_NUMBER_ID || "1081673671705273";

    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: String(to).replace(/\D/g, ""), // removes + spaces etc
        type: "text",
        text: {
          body: message
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(response.data);
    return response.data;

  } catch (error) {
    console.log(error.response?.data || error.message);
  }
}

module.exports = sendWhatsAppMessage;