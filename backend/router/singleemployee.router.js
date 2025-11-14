const express = require('express');
const router = express.Router();
const { registerEmployee, acceptTeamRequest } = require('../controllers/employee.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/register', registerEmployee);

router.post("/acceptteamrequest",protect,acceptTeamRequest);

module.exports = router;