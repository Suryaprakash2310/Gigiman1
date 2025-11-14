const express=require('express');
const router=express.Router();
const { showCategories } = require('../controllers/Parts.controller');

router.get("/categories",showCategories);

module.exports=router;