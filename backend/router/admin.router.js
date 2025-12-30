const express=require('express');
const { protect } = require('../middleware/auth.middleware');
const { adminLogin, checkAuth, getEmployeecounts, Adddomainservice, AddServiceList, SetSubService } = require('../controllers/admin.controller');
const { allowRoles } = require('../middleware/role.middleware');
const router=express.Router();

//Login admin
router.post("/login",adminLogin);

//check auth
router.get("/check-auth",protect,checkAuth);

//count the total user
router.get("/employee-counts",protect,allowRoles("admin"),getEmployeecounts)

//Added the domain Service
router.post("/add-domain-service",protect,allowRoles("admin"),Adddomainservice);

router.post("/add-service-list",protect,allowRoles("admin"),SetSubService);

module.exports=router;