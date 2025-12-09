const crypto = require("crypto");

const AADHAR_SECRET = process.env.AADHAR_KEY_SECRET;

// MUST be 32 bytes for AES-256
const KEY = crypto.createHash("sha256").update(AADHAR_SECRET).digest();
const IV = crypto.randomBytes(16); 

// Encrypt Aadhaar
exports.encryptAadhaar = (aadhaarNo) => {
    const cipher = crypto.createCipheriv("aes-256-ctr", KEY, IV);
    const encrypted = Buffer.concat([
        cipher.update(aadhaarNo, "utf8"),
        cipher.final(),
    ]);

    // return IV + encrypted (needed for decryption)
    return IV.toString("hex") + ":" + encrypted.toString("hex");
};

// Hash Aadhaar (for duplicate checking)
exports.hashAadhaar = (aadhaarNo) => {
    return crypto.createHash("sha256").update(aadhaarNo).digest("hex");
};

// Mask Aadhaar (last 4 digits)
exports.maskAadhaar = (aadhaarNo) => {
    return `XXXX-XXXX-${aadhaarNo.slice(-4)}`;
};
