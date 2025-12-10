const router = require("express").Router();
const parts = require("../controllers/parts.controller");

router.post("/create", parts.createPartRequest);


module.exports = router;
