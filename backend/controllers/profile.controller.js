const jwt=require('jsonwebtoken');
const SingleEmployee=require('../models/singleEmployee');
const MultipleEmployee=require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
// Generate JWT token
const generateToken = (emp) => {
  return jwt.sign(
    {
      id: emp._id,
      employeeId: emp.empId || emp.TeamId || emp.toolShopId,
      role: emp.role
    },
    process.env.JWT_KEY,
    { expiresIn: '7d' }
  );
};

exports.getProfile=async(req,res)=>{
    try{
        const employeeId=req.emp.id;
    if(!employeeId){
        res.status(400).json({message:"Employee is not register"});
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