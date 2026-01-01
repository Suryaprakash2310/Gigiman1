const jwt = require('jsonwebtoken');
const ToolShop = require('../models/toolshop.model');
const ROLES = require('../enum/role.enum');
const Domainparts = require('../models/domainparts.model');
const { maskPhone} = require('../utils/crypto');

// JWT creator
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: "7d" });
};

exports.registerShop = async (req, res) => {
  try {
    let { shopName, ownerName, gstNo, storeLocation, phoneNo, role, categories } = req.body;
     // Clean empty values
    categories = Array.isArray(categories) ? categories.filter(id => id) : [];
    if (!shopName || !ownerName || !gstNo || !storeLocation || !phoneNo) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (role !== ROLES.TOOL_SHOP) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if(!Array.isArray(categories)){
      return res.status(400).json({message:"Categories must be an array"});
    }
    const valid=await Domainparts.find({_id:{$in:categories}});
     if (valid.length !== categories.length) {
      return res.status(400).json({ message: "One or more categories are invalid" });
    }
    const maskedPhone=maskPhone(phoneNo);


    const existingShop = await ToolShop.findOne({
      $or: [{ gstNo }, { phoneNo }]
    });

    if (existingShop) {
      return res.status(400).json({ message: "Shop already registered" });
    }

    const shop = await ToolShop.create({
      shopName,
      ownerName,
      gstNo,
      storeLocation,
      phoneNo,
      phoneMasked:maskedPhone,
      role: ROLES.TOOL_SHOP,
      categories
    });

    return res.status(201).json({
      toolShopId: shop.toolShopId,
      shopName: shop.shopName,
      ownerName: shop.ownerName,
      phoneNo: shop.phoneMasked,
      gstNo: shop.gstNo,
      role: shop.role,
      categories:shop.categories,
      token: generateToken(shop),
    });

  } catch (err) {
    console.error("Shop registration error:", err.message);
    return res.status(500).json({
      message: "Error registering tool shop",
      error: err.message,
    });
  }
};
