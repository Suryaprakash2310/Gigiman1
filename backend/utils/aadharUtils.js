const crypto = require("crypto");

const AADHAR_SECRET = process.env.AADHAR_KEY_SECRET;

// KEY must be 32 bytes
const KEY = crypto.createHash("sha256").update(AADHAR_SECRET).digest();

// Encrypt Aadhaar
exports.encryptAadhaar = (aadhaarNo) => {
    if (!aadhaarNo || typeof aadhaarNo !== "string") {
        throw new Error("Invalid Aadhaar number provided for encryption");
    }

    const IV = crypto.randomBytes(16); // Generate fresh IV every time
    const cipher = crypto.createCipheriv("aes-256-ctr", KEY, IV);

    const encrypted = Buffer.concat([
        cipher.update(aadhaarNo, "utf8"),
        cipher.final(),
    ]);

    return IV.toString("hex") + ":" + encrypted.toString("hex");
};

// Hash Aadhaar
exports.hashAadhaar = (aadhaarNo) => {
    if (!aadhaarNo || typeof aadhaarNo !== "string") {
        throw new Error("Invalid Aadhaar number provided for hashing");
    }

    return crypto.createHash("sha256").update(aadhaarNo).digest("hex");
};

// Mask Aadhaar
exports.maskAadhaar = (aadhaarNo) => {
    if (!aadhaarNo || typeof aadhaarNo !== "string") {
        throw new Error("Invalid Aadhaar number provided for masking");
    }

    return `XXXX-XXXX-${aadhaarNo.slice(-4)}`;
};
