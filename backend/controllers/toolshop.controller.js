const jwt = require('jsonwebtoken');
const ToolShop = require('../models/toolshop.model');
const ROLES = require('../enum/role.enum');
const Domainparts = require('../models/domainparts.model');
const { maskPhone } = require('../utils/crypto');
const axios=require('axios');
const AppError = require('../utils/AppError');

// JWT creator
const generateToken = (tool) => {
  return jwt.sign(
    {
      id: tool._id,
      employeeId: tool.toolShopId,
      role: tool.role
    },
    process.env.JWT_KEY,
    { expiresIn: '7d' }
  );
};

exports.registerShop = async (req, res, next) => {
  try {
    let { shopName, ownerName, gstNo, latitude, longitude, phoneNo, role, categories } = req.body;
    // Clean empty values
    categories = Array.isArray(categories) ? categories.filter(id => id) : [];
    if (!shopName || !ownerName || !gstNo || !phoneNo) {
      return next(new AppError("All fields are required", 400));
    }
    if (role !== ROLES.TOOL_SHOP) {
      return next(new AppError("Invalid role", 400));
    }
    if (!Array.isArray(categories)) {
      return next(new AppError("Categories must be an array", 400));
    }
    const valid = await Domainparts.find({ _id: { $in: categories } });
    if (valid.length !== categories.length) {
      return next(new AppError("One or more categories are invalid", 400));
    }
    const maskedPhone = maskPhone(phoneNo);
    
    const MAP_BOX_TOKEN = process.env.MAP_BOX_TOKEN;

    const existingShop = await ToolShop.findOne({
      $or: [{ gstNo }, { phoneNo }]
    });

    if (existingShop) {
      return next(new AppError("Shop already registered", 400));
    }
    let address = null;
    if (latitude && longitude) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;
      const geoRes = await axios.get(url, {
        params: {
          access_token: MAP_BOX_TOKEN,
          limit: 1,
        },
      });
      address = geoRes.data.features[0]?.place_name || null;
    }
    const shop = await ToolShop.create({
      shopName,
      ownerName,
      gstNo,
      storeLocation: address,
      phoneNo,
      phoneMasked: maskedPhone,
      role: ROLES.TOOL_SHOP,
      categories,
      isActive: true, 
      shopStatus: "AVAILABLE", // optional (default already)
      location: {
        type: "Point",
        coordinates: [longitude, latitude], 
      },
    });

    return res.status(201).json({
      toolShopId: shop.toolShopId,
      shopName: shop.shopName,
      ownerName: shop.ownerName,
      phoneNo: shop.phoneMasked,
      gstNo: shop.gstNo,
      role: shop.role,
      categories: shop.categories,
      token: generateToken(shop),
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};
