const express=require('express');
const { showCategories } = require('../controllers/Parts.controller');
const router=express.Router();

router.get("/showcategories",showCategories);