const express = require('express');
const { addToCart, removeFromCart, getCart, getSuggestions } = require('../controllers/cart.controller');
const { userProtect } = require('../middleware/user.middleware');
const router = express.Router();

router.post("/add", userProtect, addToCart);
router.post("/remove", userProtect, removeFromCart);
router.get("/", userProtect, getCart);
router.get("/suggestions", userProtect, getSuggestions);

module.exports = router;