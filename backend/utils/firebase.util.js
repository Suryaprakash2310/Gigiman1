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

module.exports = {
  verifyFirebaseToken,
};
