const admin = require('firebase-admin');

// Ensure you have your Firebase service account JSON file
// and set its stringified version in FIREBASE_SERVICE_ACCOUNT in your .env
// Or simply load it via: const serviceAccount = require("../firebase-account.json");

try {
  if (!admin.apps.length) {
    // Attempt to load from env variable if available, otherwise from a local file
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : require("../firebase-account.json"); 

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully");
  }
} catch (error) {
  console.warn("Firebase Admin Initialization Warning: Please ensure firebase-account.json exists or FIREBASE_SERVICE_ACCOUNT is set in .env.\\n", error.message);
}

module.exports = admin;
