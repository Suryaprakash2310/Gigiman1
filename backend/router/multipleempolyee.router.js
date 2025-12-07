const express=require('express');
const { multipleEmployeeRegister, requestToAddMember, removeMembersFromTeam, showSingleEmployee, getTeamStatus } = require('../controllers/multiple.employee.controllers');
const { protect } = require('../middleware/auth.middleware');
const router=express.Router();


router.post("/register",multipleEmployeeRegister);

//show Single employees
router.post("/showSingle-employee",protect,showSingleEmployee);

//Requesting add Member in the Multiple employee
router.post("/requesttoaddmember",protect,requestToAddMember);

//Removing added Member in the Multiple Employee
router.post("/removemembersfromteam",protect,removeMembersFromTeam);

router.get("/team-status", protect, getTeamStatus);

module.exports = router;