const cryptoJs=require('crypto-js');
const crypto = require('crypto');
require('dotenv').config();
const SECRET=process.env.PHONE_SECRET_KEY;

exports.encryptPhone=(phone)=>{
    if(!SECRET)throw new Error("Phone_Secret key not set");
    return cryptoJs.AES.encrypt(phone,SECRET).toString();
}
exports.decryptPhone=(cipher)=>{
    if(!SECRET)throw new Error("Phone_Secret key not set");
    const bytes=cryptoJs.AES.decrypt(cipher,SECRET);
    return bytes.toString(cryptoJs.enc.Utf8);
}

exports.maskPhone=(phone)=>{
    return "xxxxxx" + phone.slice(-4);
}

exports.hashPhone=(phone)=>{
    return crypto.createHash("sha256").update(phone).digest("hex");
}