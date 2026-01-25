const jwt=require('jsonwebtoken');
const SingleEmployee=require('../models/singleEmployee.model');
const MultipleEmployee=require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const ROLES = require('../enum/role.enum');
const AppError = require('../utils/AppError');

exports.getProfile = async (req, res, next) => {
  try {
    const employeeId = req.employee.id;

    let employee =
      (await SingleEmployee.findById(employeeId)) ||
      (await MultipleEmployee.findById(employeeId)) ||
      (await ToolShop.findById(employeeId));

    if (!employee) {
      return next(new AppError("Employee not found",404))
    }

    //  If MULTIPLE EMPLOYEE → include team details
    if (employee.role === ROLES.MULTIPLE_EMPLOYEE) {

      const members = await SingleEmployee.find({
        empId: { $in: employee.members }
      }).select("empId fullname teamAccepted");

      const pendingRequests = await SingleEmployee.find({
        empId: { $in: employee.pendingRequests }
      }).select("empId fullname teamAccepted");

      return res.status(200).json({
        success: true,
        employee: {
          ...employee._doc,
          members,
          pendingRequests
        }
      });
    }

    // Normal user (single employee or shop)
    return res.status(200).json({
      success: true,
      employee
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


exports.editprofile=async(req, res, next)=>{
    try{
      const employee=req.employee;
      const role=req.role;
      let allowFields=[];
      if(role==="SINGLE_EMPLOYEE"){
        allowFields=["fullname","address"];
      }
      if(role==="MULTIPLE_EMPLOYEE"){
        allowFields=["storeName","ownerName","storeLocation"];
      }
      if(role==="TOOL_SHOP"){
        allowFields=["shopName","ownerName","storeLocation"];
      }
      //validate incoming fields
      const updates=Object.keys(req.body);
      
      const valid=updates.every((f)=>allowFields.includes(f));
      if(!valid){
        return next(new AppError("Invalid updates!",400));
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
      next(err);
    }
}