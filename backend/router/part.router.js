const express = require('express');
const router = express.Router();
const { showCategories, showParts, searchDomainCategories, searchParts, createPartRequest, showpartById, downloadPartBill } = require('../controllers/part.controller');


router.get("/showcategories", showCategories);

router.get("/showpart/:DomainpartId", showpartById);

//  Show parts for a selected category
router.get("/showparts", showParts);

//  Search domain (first page search)
router.get("/search-domain", searchDomainCategories);

//  Search parts inside selected domain (second page search)
router.get("/search-parts", searchParts);

router.get("/download-bill/:requestId", downloadPartBill);


// router.post("/create-parts-request",createPartRequest);
module.exports = router;