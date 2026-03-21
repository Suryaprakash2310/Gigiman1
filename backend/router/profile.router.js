const express=require('express');
const { getProfile, editprofile, getMyJobReview } = require('../controllers/profile.controller');
const { protect } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');
const router=express.Router();

router.get("/getprofile",protect,getProfile);

router.put("/edit-profile",protect,upload.single('avatar'),editprofile);

router.get("/reviews",protect,getMyJobReview);

module.exports=router;