const jwt=require('jsonwebtoken');
const Domainpart = require('../models/domainparts.model');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: "7d" });
};

//Showcategories
exports.showCategories=async(req,res)=>{
  try{
    const categories=await Domainpart.aggregate([
      {$project:{_id:1,domaintoolname:1}},
      {$sort:{domaintooname:1}},
    ]);
    res.staus(200).json({
      success:true,
      total:categories.length,
      categories,
    });
  }
  catch(err){
    console.error("Error loading categories",err.message);
    res.status(500).json({message:"Server error",error:err.message});
  }
};
