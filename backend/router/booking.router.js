const express = require("express");
const router = express.Router();

const {
  searchNearbyservicer,
  autoAssignServicer,
  createBookingFinal,
  teamAssignMembers,
  generateStartOtpcontroller,
  verifystartOTPcontroller,
  requestToolController,
  nearbyToolShops,
  autoAssignToolShop,
  verifyToolOTPcontroller,
  verifyPartOTPcontroller,
  paymentSuccess,
} = require("../controllers/booking.controller");

/* ===============================
   SEARCH & AUTO ASSIGN
=============================== */
router.post("/search", searchNearbyservicer);
router.post("/auto-assign", autoAssignServicer);

/* ===============================
   BOOKING
=============================== */
router.post("/create", createBookingFinal);
router.post("/team/assign", teamAssignMembers);

/* ===============================
   START WORK OTP
=============================== */
router.post("/otp/start/generate", generateStartOtpcontroller);
router.post("/otp/start/verify", verifystartOTPcontroller);

/* ===============================
   TOOL REQUEST
=============================== */
router.post("/tool/request", requestToolController);
router.post("/tool/nearby", nearbyToolShops);
router.post("/tool/auto-assign", autoAssignToolShop);
router.post("/tool/otp/verify", verifyToolOTPcontroller);

/* ===============================
   PART OTP
=============================== */
router.post("/part/otp/verify", verifyPartOTPcontroller);

/* ===============================
   PAYMENT
=============================== */
router.post("/payment/success", paymentSuccess);

module.exports = router;
