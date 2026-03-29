const admin = require("firebase-admin");


try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require("./serviceAccountKey.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("Firebase Admin initialized successfully");
} catch (error) {
  console.error("Firebase Admin initialization error:", error.message);
}

module.exports = admin;
