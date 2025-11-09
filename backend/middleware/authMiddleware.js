const multipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee");
const Shop = require("../models/toolshop.model");
const jwt=require("jsonwebtoken");

exports.protect=async(req,res,next)=>{
    // Extract token (the second part after 'Bearer')
    let token=req.headers.authorization?.split(" ")[1];
    if(!token){
        res.status(404).json({message:"Not authorization"});
    }
    try{
    // Verify token
    const decoded=jwt.verify(token,process.env.JWT_KEY);
        
    // Try to find user in SingleEmployee first
      let employee =
      (await SingleEmployee.findById(decoded.id)) ||
      (await multipleEmployee.findById(decoded.id)) ||
      (await Shop.findById(decoded.id));

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    req.employee = employee;
    req.employeeId=decoded.employeeId;
    req.role=decoded.role;
    //proceed to next middleware or route
    next();
    }
    //Anothewise any problem catch is run
    catch(err){
        res.status(404).json({message:"Not authorization"});
    }
}