const express = require("express");
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { userProtect } = require('../middleware/user.middleware');
const bookingController = require("../controllers/booking.controller");
const validate = require("../middleware/validation.middleware");
const schemas = require("../validations/booking.validation");

/* ===============================
   SEARCH & AUTO ASSIGN
=============================== */
router.post("/search", bookingController.searchNearbyservicer);
router.post("/auto-assign", validate(schemas.autoAssignServicer), userProtect,bookingController.autoAssignServicer);
router.post('/schedule', userProtect, bookingController.scheduleBooking);
router.post("/domain/visit/:domainServiceId", bookingController.createVisitBooking);
/* ===============================
   BOOKING
=============================== */
router.post("/team/assign", bookingController.teamAssignMembers);
router.get("/active/user", userProtect, bookingController.getActiveUserBookings);
router.get("/scheduled/user", userProtect, bookingController.getScheduledUserBookings);

/* ===============================
   START WORK OTP
=============================== */
// router.post("/otp/start/generate", bookingController.generateStartOtpcontroller);
router.post("/otp/start/verify", bookingController.verifystartOTPcontroller);

/* ===============================
   TOOL / PART REQUEST FLOW
=============================== */

router.post("/tool/request", protect, bookingController.requestToolController);

router.post("/approve/:requestId", userProtect, bookingController.approvePartRequest);

/* ===============================
   EXTRA SERVICES
=============================== */
router.post("/extra/propose", protect, bookingController.proposeExtraService);
router.post("/extra/approve", userProtect, bookingController.approveExtraService);

router.get("/parts/part-request/:requestId", protect, bookingController.getPartRequestById);

router.post("/tool/nearby", bookingController.nearbyToolShops);

router.post("/tool/auto-assign", bookingController.autoAssignToolShop);


router.post("/tool/otp/verify", bookingController.verifyPartOTPcontroller);

/* ===============================
   PAYMENT & REVIEW
=============================== */
router.post("/review/:bookingId", userProtect, validate(schemas.submitReview), bookingController.submitReview);
router.get("/review", protect, bookingController.getReviewByService);
router.post("/createorder/:bookingId", bookingController.createOrderController);
router.post("/payment/success", bookingController.paymentSuccess);


//Booking history
router.get("/history/user", userProtect, bookingController.getUserRecentBookingHistory);
router.get("/history/servicer", protect, bookingController.getEmployeeRecentBookingHistory);

/* ===============================
   POPULAR BOOKINGS
=============================== */
router.get("/popularbookings", bookingController.getPopularBookings);


router.get("/:bookingId", bookingController.getBookingById);

module.exports = router;
