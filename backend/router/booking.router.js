const express = require("express");
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { userProtect } = require('../middleware/user.middleware'); 
const bookingController = require("../controllers/booking.controller");

/* ===============================
   SEARCH & AUTO ASSIGN
=============================== */
router.post("/search", bookingController.searchNearbyservicer);
router.post("/auto-assign", bookingController.autoAssignServicer);
router.get("/:bookingId", bookingController.getBookingById);
/* ===============================
   BOOKING
=============================== */
router.post("/team/assign", bookingController.teamAssignMembers);

/* ===============================
   START WORK OTP
=============================== */
// router.post("/otp/start/generate", bookingController.generateStartOtpcontroller);
router.post("/otp/start/verify", bookingController.verifystartOTPcontroller);

/* ===============================
   TOOL / PART REQUEST FLOW
=============================== */

router.post("/tool/request", protect, bookingController.requestToolController);

router.post("/tool/nearby",bookingController.nearbyToolShops);

router.post("/tool/auto-assign",bookingController.autoAssignToolShop);


router.post("/tool/otp/verify",bookingController.verifyPartOTPcontroller);

/* ===============================
   PAYMENT
=============================== */
router.post("/review",userProtect, bookingController.submitReview);
router.post("/payment/success", bookingController.paymentSuccess);

module.exports = router;
