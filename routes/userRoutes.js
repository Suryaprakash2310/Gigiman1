const express = require('express');
const router = express.Router();
const controller = require('../controllers/auth.controller');
const auth = require('../middleware/auth');

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/services', controller.service);
router.get('/subservices', controller.subservice);

// Authenticated routes
router.post('/book', auth, controller.createBooking);
router.get('/mybookings', auth, controller.getBookings);

module.exports = router;
