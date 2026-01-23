const express = require('express');
const router = express.Router();
const { registerEmployee, acceptTeamRequest, getTeamRequest, rejectTeamRequest, getMyTeam, leaveTeam } = require('../controllers/employee.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/register', registerEmployee);

router.post("/acceptteamrequest",protect,acceptTeamRequest);

router.get("/showrequest",protect,getTeamRequest);

router.post("/reject-requests",protect,rejectTeamRequest);


router.get("/my-team",protect,getMyTeam);

router.post("/leave-team",protect,leaveTeam);


module.exports = router;