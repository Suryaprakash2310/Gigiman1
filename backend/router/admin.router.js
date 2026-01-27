const express=require('express');
const { protect } = require('../middleware/auth.middleware');
const { adminLogin, checkAuth, getEmployeecounts, Adddomainservice,  getAllEmployee, DeleteDomainService, setServiceList, deleteServiceCategory, updateServiceCategory, EditDomainService, getServiceCategories, setDomainTool, editDomainToolById } = require('../controllers/admin.controller');
const { allowRoles } = require('../middleware/role.middleware');
const router=express.Router();

//Login admin
router.post("/login",adminLogin);

//check auth
router.get("/check-auth",protect,checkAuth);

//count the total user
router.get("/employee-counts",protect,allowRoles("admin"),getEmployeecounts)

router.get("/get-all-employee",protect,allowRoles("admin"),getAllEmployee);

//Added the domain Service
router.post("/add-domain-service",protect,allowRoles("admin"),Adddomainservice);

router.post("/add-service-list",protect,allowRoles("admin"),setServiceList);

router.delete("/delete-domain-service/:id",protect,allowRoles("admin"),DeleteDomainService);

router.put("/domainservice-edit/:DomainserviceId",protect,allowRoles("admin"),EditDomainService)

router.put("/update-service-category/:serviceId/:categoryId",protect,allowRoles("admin"),updateServiceCategory);

router.delete("/delete-service-category/:serviceId/:categoryId",protect,allowRoles("admin"),deleteServiceCategory);

router.get("/service-categories/:DomainServiceId",protect,allowRoles("admin"),getServiceCategories);

router.post("/add-domainpart",protect,allowRoles("admin"),setDomainTool);

router.put("/domainpart/:domainpartId",protect,allowRoles("admin"),editDomainToolById);

router.delete("/delete-domainpart/:domainpartId",protect,allowRoles("admin"),DeleteDomainService);

module.exports=router;