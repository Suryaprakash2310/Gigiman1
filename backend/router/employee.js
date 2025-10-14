const express = require('express');
const router = express.Router();
const { registerEmployee } = require('../controllers/employee.controller');

router.post('/register', registerEmployee);

module.exports = router;