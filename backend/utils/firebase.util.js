const admin = require("../config/firebase");

/**
 * Verifies a Firebase ID Token (received from the mobile app after successful SMS verification)
 * @param {string} idToken - The token sent from the frontend
 * @returns {Promise<Object>} The verified user data
 */
const verifyFirebaseToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error("Firebase Auth Error:", error.message);
    throw new Error("Invalid SMS Verification Token");
  }
};

/**
 * Helper function to convert data object values to String as required by FCM
 */
const formatFcmData = (dataObj = {}) => {
  const formatted = {};
  for (const [key, value] of Object.entries(dataObj)) {
    if (value !== null && value !== undefined) {
      if (typeof value === "object") {
        formatted[key] = JSON.stringify(value);
      } else {
        formatted[key] = String(value);
      }
    }
  }
  return formatted;
};

/**
 * Sends FCM push notification to single device token or multiple tokens
 * @param {Object} options
 * @param {string} [options.fcmToken] - Target single FCM token
 * @param {string[]} [options.fcmTokens] - Array of target FCM tokens
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {Object} [options.data] - Additional metadata payload
 */
const sendFcmNotification = async ({ fcmToken = null, fcmTokens = [], title, body, data = {} }) => {
  try {
    if (!admin.apps.length) {
      console.warn("Firebase Admin not initialized. Skipping FCM notification.");
      return null;
    }

    const payloadData = formatFcmData(data);
    const validTokens = Array.isArray(fcmTokens)
      ? fcmTokens.filter((t) => typeof t === "string" && t.trim().length > 0)
      : [];
    if (fcmToken && typeof fcmToken === "string" && fcmToken.trim().length > 0) {
      if (!validTokens.includes(fcmToken)) {
        validTokens.push(fcmToken);
      }
    }

    if (validTokens.length === 0) {
      return null;
    }

    if (validTokens.length === 1) {
      const message = {
        token: validTokens[0],
        notification: {
          title: title || "New Notification",
          body: body || "",
        },
        data: payloadData,
        android: {
          priority: "high",
          notification: {
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      console.log("FCM single notification sent successfully:", response);
      return response;
    } else {
      const multicastMessage = {
        tokens: validTokens,
        notification: {
          title: title || "New Notification",
          body: body || "",
        },
        data: payloadData,
        android: {
          priority: "high",
          notification: {
            sound: "default",
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(multicastMessage);
      console.log(`FCM multicast sent to ${response.successCount}/${validTokens.length} devices.`);
      return response;
    }
  } catch (error) {
    console.error("FCM Notification Error:", error.message);
    return null;
  }
};

module.exports = {
  verifyFirebaseToken,
  sendFcmNotification,
};
