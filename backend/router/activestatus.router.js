const express=require('express');
const router=express.Router();
const{protect}=require('../middleware/auth.middleware');
const { updateActiveStatus } = require('../controllers/activeStatus.controller');


router.put("/active-status",protect,updateActiveStatus);

module.exports=router;