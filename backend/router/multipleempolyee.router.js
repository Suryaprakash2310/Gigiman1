const express=require('express');
const { multipleEmployeeRegister, requestToAddMember, removeMembersFromTeam, showSingleEmployee } = require('../controllers/multiple.employee.controllers');
const { protect } = require('../middleware/auth.middleware');
const router=express.Router();


router.post("/register",multipleEmployeeRegister);

//show Single employees
router.post("/showSingle-employee",showSingleEmployee);

//Requesting add Member in the Multiple employee
router.post("/requesttoaddmember",protect,requestToAddMember);

//Removing added Member in the Multiple Employee
router.post("/removemembersfromteam",protect,removeMembersFromTeam);


module.exports = router;