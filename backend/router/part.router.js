const express=require('express');
const router=express.Router();
const { showCategories, showParts, searchDomainCategories, searchParts } = require('../controllers/Parts.controller');

router.get("/categories",showCategories);

//  Show parts for a selected category
router.get("/showparts", showParts);

//  Search domain (first page search)
router.get("/search-domain", searchDomainCategories);

//  Search parts inside selected domain (second page search)
router.get("/search-parts", searchParts);

module.exports=router;