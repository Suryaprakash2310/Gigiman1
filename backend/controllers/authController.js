const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const SingleEmployee = require("../models/singleEmployee");
const MultipleEmployee = require("../models/multipleEmployee.model");
const Shop = require("../models/toolshop.model");
const DomainService = require("../models/domainservice.model");
const Domainparts = require("../models/domainparts.model");
const EmployeeService=require("../models/employeeService.model");
//  store both: database _id AND employeeId / teamId / shopId
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      employeeId: user.empId || user.TeamId || user.toolShopId,  // <-- here
      role: user.role
    },
    process.env.JWT_KEY,
    { expiresIn: "7d" }
  );
};


// Temporary in-memory OTP store (for demo purposes)
// In production, store in DB with expiry
const otpStore = {};

exports.sendOtp = async (req, res) => {
  const { phoneNo } = req.body;
  if (!phoneNo) return res.status(400).json({ message: "Phone number is required" });

  try {
    // Check if user exists in any model
    let user = await SingleEmployee.findOne({ phoneNo }) ||
      await MultipleEmployee.findOne({ phoneNo }) ||
      await Shop.findOne({ phoneNo });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999);
    otpStore[phoneNo] = otp; // save OTP temporarily
    console.log(`OTP for ${phoneNo} is ${otp}`); // in real app, send via SMS

    res.status(200).json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("OTP error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  const { phoneNo, otp } = req.body;
  if (!phoneNo || !otp) return res.status(400).json({ message: "Phone and OTP required" });

  try {
    const user = await SingleEmployee.findOne({ phoneNo }) ||
      await MultipleEmployee.findOne({ phoneNo }) ||
      await Shop.findOne({ phoneNo });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Check OTP
    if (otpStore[phoneNo] != otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP verified, delete it
    delete otpStore[phoneNo];

    // Generate JWT token
    const token = generateToken(user);

    res.status(200).json({
      id: user._id,
      type: user.constructor.modelName,
      data: user,
      employeeId: user.empId || user.TeamId || user.toolShopId,
      role: user.role,
      token,
      message: "Login successful",
    });
  } catch (err) {
    console.error("OTP verify error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

//Show the services

exports.ShowServices = async (req, res) => {
  try {
    const services = await DomainService.aggregate([
      { $sort: { domainName: 1 } }
    ]);

    if (!services || services.length === 0) {
      return res.status(404).json({ message: "No services found" });
    }

    return res.status(200).json({
      message: "Services fetched successfully",
      count: services.length,
      services,
    });

  } catch (err) {
    console.error("Service get issue", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


//Search the service
exports.searchService = async (req, res) => {
  try {
    const { q = "" } = req.query;

    const services = await DomainService.aggregate([
      {
        $match: {
          domainName: { $regex: q, $options: "i" }
        }
      },
      { $sort: { domainName: 1 } }
    ]);

    res.status(200).json({
      success: true,
      count: services.length,
      services
    });
  } catch (err) {
    console.error("Searching controller error", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

//Add Service Multiple Employee and single Employee
exports.addEmployeeService=async(req,res)=>{
  try{
    const employeeId=req.employeeId;
    const {serviceId}=req.query;
    if(!serviceId){
      return res.status(400).json({message:"Service ID is required"});
    }
    let record=await EmployeeService.findOne({employeeId});
    if(!record){
      record=await EmployeeService.create({
        employeeId,
        capableService:[serviceId],
      });
    }
    else{
      if (record.capableService.length >= 3) {
        return res.status(400).json({
          message: "Maximum 3 services allowed per employee",
        });
      }
    }
    if(record.capableService.include(serviceId)){
      return res.status(400).json({
        message:"Service already added"
      });
    }
    record.capableService.push(serviceId);
    await record.save();
    res.status(200).json({
      success:true,
      employeeId,
      capableService:record.capableService,
      message:"Service added to employee Successfully"
    })
  }
  catch(err){
    console.error("Service controller is error",err.message);
    res.status(500).json({message:"Server error",error:err.message});
  }
}

//Showcategories
exports.showCategories=async(req,res)=>{
  try{
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({
        message: "Job must be created before viewing parts"
      });
    }
    const categories=await Domainparts.aggregate([
      {$project:{_id:1,domainName:1}},
      {$sort:{domainName:1}},
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

//showparts
exports.showParts = async (req, res) => {
  try {
    const { jobId,categoriesId } = req.query;
    if (!jobId) {
      return res.status(400).json({ message: "Job must be created before viewing parts" });
    }
    if (!categoriesId) {
      return res.status(400).json({ message: "categories is required" });
    }

    const partsList=await Domainparts.aggregate([
      {
        $match:{_id:new mongoose.Types.objectId(categoriesId)}
      },
      {$unwind:"$parts"},
      {$sort:{"parts.partsname":1}},
      {
        $group:{
          _id:"$id",
          domaintoolname:{$first:"$domaintoolname"},
          parts:{$push:"$parts"},
        }
      }
    ])
    res.status(200).json({
      success: true,
      jobId,
      category:partsList[0]?.domaintoolname ||"",
      totlaparts:partsList[0]?.parts.length||0,
      parts:partsList[0]?.parts||[],
    });
  } catch (err) {
    console.error("Error showing parts:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

exports.searchDomain = async (req, res) => {
  try {
    const { q = "" } = req.query;

    const domains = await Domainparts.aggregate([
      {
        $match: {
          domaintoolname: { $regex: q, $options: "i" },
        }
      },
      {
        $project: {
          domaintoolname: 1
        }
      },
      { $sort: { domaintoolname: 1 } }
    ]);

    res.status(200).json({
      success: true,
      count: domains.length,
      domains,
    });

  } catch (err) {
    console.error("Domain search error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.searchParts = async (req, res) => {
  try {
    const { domain = "", q = "" } = req.query;

    const partsList = await Domainparts.aggregate([
      {
        $match: {
          domaintoolname: { $regex: domain, $options: "i" },
        }
      },
      { $unwind: "$parts" },
      {
        $match: {
          "parts.partsname": { $regex: q, $options: "i" }
        }
      },
      {
        $group: {
          _id: "$_id",
          domaintoolname: { $first: "$domaintoolname" },
          parts: { $push: "$parts" },
        }
      },
      { $sort: { domaintoolname: 1 } }
    ]);

    res.status(200).json({
      success: true,
      count: partsList.length,
      parts: partsList,
    });

  } catch (err) {
    console.error("Parts search error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


exports.partrequest=async(req,res)=>{
  try{

  }catch(err){
    
  }
}