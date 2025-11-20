const crypto=require('crypto');

const AADHAR_SECRET=process.env.AADHAR_KEY_SECRET;

//Encrypt Aadhaar
exports.encryptAadhaar=(aadhaarNo)=>{
    const cipher=crypto.createCipher("aes-256-ctr",AADHAR_SECRET);
    let encrypted=cipher.update(aadhaarNo,"utf8","hex");
    encrypted+=cipher.final("hex");
    return encrypted;
}

//Hash Aadhaar(for duplicate checking)
exports.hashAadhaar=(aadhaarNo)=>{
    return crypto.createHash("sha256").update(aadhaarNo).digest("hex");
}

//Mask Aadhaar -> show only last 4 digits
exports.maskAadhaar=(aadhaarNo)=>{
    return `XXXX-XXXX-${aadhaarNo.slice(-4)}`;
}