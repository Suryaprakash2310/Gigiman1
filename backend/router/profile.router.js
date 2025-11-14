const express=require('express');
const { getProfile } = require('../controllers/profile.controller');
const { protect } = require('../middleware/authMiddleware');
const router=express.Router();

router.get("/profiles",protect,getProfile)