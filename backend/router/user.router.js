const express = require('express');
const {
    completeProfile,
    sendOtp,
    verifyOtp,
    getProfile,
    editprofile,
    addAddress,
    getAddresses,
    deleteAddress,
    updateAddress
} = require('../controllers/user.controller');
const { userProtect } = require('../middleware/user.middleware');
const { tempProtect } = require('../middleware/temp.middleware');

const router = express.Router();

router.post("/register", tempProtect, completeProfile);

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.get("/profile", userProtect, getProfile);
router.put("/edit-profile", userProtect, editprofile);

// Address Management
router.post("/address", userProtect, addAddress);
router.get("/address", userProtect, getAddresses);
router.delete("/address/:addressId", userProtect, deleteAddress);
router.put("/address/:addressId", userProtect, updateAddress);


module.exports = router;