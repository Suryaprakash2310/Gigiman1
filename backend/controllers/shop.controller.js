const jwt=require('jsonwebtoken');
const Shop=require('../models/shop.model');

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

exports.registerShop=async(req,res)=>{
    const{shopName,ownerName,gstNo,storeLocation,phoneNo}=req.body;
    if(!shopName || !ownerName || !gstNo ||!storeLocation ||!phoneNo){
       return res.status(400).json({message:"All fields are required"});
    }
    try{
        //Check if shop already exists
        const existingshop=await Shop.findOne({phoneNo});
        if(existingshop){
          return res.status(400).json({message:"Shop is already registered"});
        }
        //Create New Shop
        const shop=await Shop.create({
            shopName,
            ownerName,
            gstNo,
            storeLocation,
            phoneNo
        });
        res.status(200).json({
            shopName:shop.shopName,
            ownerName:shop.ownerName,
            gstNo:shop.gstNo,
            storeLocation:shop.storeLocation,
            phoneNo:shop.phoneNo,
            token:generateToken(shop._id)
        })
    }
    catch(err){
        console.error("Shop registration error:", err.message);
        res.status(500).json({ message: "Error during registration", error: err.message });
    }
}