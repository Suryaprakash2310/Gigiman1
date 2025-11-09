const jwt = require('jsonwebtoken');
const ToolShop = require('../models/toolshop.model');
const ROLES = require('../enum/role.model');

// JWT creator
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: "7d" });
};

exports.registerShop = async (req, res) => {
  try {
    const { shopName, ownerName, gstNo, storeLocation, phoneNo, role } = req.body;

    if (!shopName || !ownerName || !gstNo || !storeLocation || !phoneNo) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
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
      role: ROLES.TOOL_SHOP
    });

    return res.status(201).json({
      toolShopId: shop.toolShopId,
      shopName: shop.shopName,
      ownerName: shop.ownerName,
      phoneNo: shop.phoneNo,
      gstNo: shop.gstNo,
      role: shop.role,
      token: generateToken(shop._id),
    });

  } catch (err) {
    console.error("Shop registration error:", err.message);
    return res.status(500).json({
      message: "Error registering tool shop",
      error: err.message,
    });
  }
};
