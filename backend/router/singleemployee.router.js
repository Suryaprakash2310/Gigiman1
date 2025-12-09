const express = require('express');
const router = express.Router();
const { registerEmployee, acceptTeamRequest, getTeamRequest, rejectTeamRequest } = require('../controllers/employee.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/register', registerEmployee);

router.post("/acceptteamrequest",protect,acceptTeamRequest);

router.get("/showrequest",protect,getTeamRequest);

router.post("/reject-requests",protect,rejectTeamRequest);

module.exports = router;