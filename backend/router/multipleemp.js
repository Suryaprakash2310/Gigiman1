const express=require('express');
const { multipleEmployeeRegister } = require('../controllers/multiple.employee.controllers');
const router=express.Router();


router.post("/register",multipleEmployeeRegister);


module.exports = router;