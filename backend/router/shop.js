const express=require("express");
const { registerShop } = require("../controllers/shop.controller");
const router=express.Router();

router.post("/register",registerShop);


module.exports = router;