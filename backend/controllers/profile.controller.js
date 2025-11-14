const jwt=require('jsonwebtoken');
const SingleEmployee=require('../models/singleEmployee');
const MultipleEmployee=require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');

exports.getProfile=async(req,res)=>{
    try{
    const employeeId=req.employee.id;
    if(!employeeId){
        return res.status(400).json({message:"Employee is not register"});
    }
    let employee=await SingleEmployee.findById(employeeId)||
    await MultipleEmployee.findById(employeeId)|| 
    await ToolShop.findById(employeeId)
    if (!employee) {
      return res.status(404).json({ message: "Employee profile not found" });
    }
    res.status(200).json({
        success:true,
        employee
    })
    }
    catch(err){
        console.error("Getprofile controller error",err.message);
        res.status(500).json({message:"server error",error:err.message});
    }
}

exports.editprofile=async(req,res)=>{
    try{
      const employee=req.employee;
      const role=req.role;
      let allowFields=[];
      if(role==="SINGLE_EMPLOYEE"){
        allowFields=["fullname","address","aadhaarNo"];
      }
      if(role==="MULTIPLE_EMPLOYEE"){
        allowFields=["storeName","ownerName","gstNo","storeLocation"];
      }
      if(role==="TOOL_SHOP"){
        allowFields=["shopName","ownerName","storeLocation"];
      }
      //validate incoming fields
      const updates=Object.keys(req.body);
      
      const valid=updates.every((f)=>allowFields.includes(f));
      if(!valid){
        return res.status(400).json({
          success:false,
          message:"Invalid fields for update",
        });
      }
      //Apply updates dynamically
      //include the nested address safety
       updates.forEach((field) => {
      if (field === "address" && typeof req.body.address === "object") {
        // Merge address fields
        employee.address = {
          ...employee.address,
          ...req.body.address,
        };
      } else {
        employee[field] = req.body[field];
      }
    });
      await employee.save();
      res.status(200).json({
        success:true,
        message:"Profile updated successfully",
        updateProfile:employee
      })
    }catch(err){
      console.error("Edit profile err",err.message);
      res.status(500).json({message:"Server error",error:err.message});
    }
}