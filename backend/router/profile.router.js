const express=require('express');
const { getProfile, editprofile, getMyJobReview } = require('../controllers/profile.controller');
const { protect } = require('../middleware/auth.middleware');
const router=express.Router();

router.get("/getprofile",protect,getProfile);

router.put("/edit-profile",protect,editprofile);

router.get("/reviews",protect,getMyJobReview);

module.exports=router;