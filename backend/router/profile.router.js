const express=require('express');
const { getProfile, editprofile } = require('../controllers/profile.controller');
const { protect } = require('../middleware/auth.middleware');
const router=express.Router();

router.get("/getprofile",protect,getProfile);

router.put("/edit-profile",protect,editprofile);


module.exports=router;