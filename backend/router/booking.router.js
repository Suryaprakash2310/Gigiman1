const { searchNearbyservicer, createBookingFinal, teamAssignMembers, autoAssignServicer, autoAssignToolShop, generateStartOtpcontroller, verifystartOTPcontroller, requestToolController, nearbyToolShops, generateToolOTPcontroller, verifyToolOTPcontroller, paymentSuccess } = require("../controllers/booking.controller");

const router = require("express").Router();


router.post("/nearby", searchNearbyservicer);
router.post("/create", createBookingFinal);
router.post("/team-assign", teamAssignMembers);

// Auto assign single/team
router.post("/auto-assign-servicer", autoAssignServicer);

// Auto assign toolshop
router.post("/auto-assign-toolshop", autoAssignToolShop);


router.post("/start-otp",generateStartOtpcontroller);
router.post("/verify-start-otp", verifystartOTPcontroller);

router.post("/tool-request",requestToolController);
router.post("/toolshops", nearbyToolShops);

router.post("/tool-otp", generateToolOTPcontroller);
router.post("/verify-tool-otp", verifyToolOTPcontroller);

router.post("/payment-success", paymentSuccess);

module.exports = router;
