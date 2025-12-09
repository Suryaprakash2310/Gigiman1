const ROLES = require('../enum/role.enum');
const MultipleEmployee = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee.model');
const jwt = require('jsonwebtoken');
const DomainService = require("../models/domainservice.model");
const EmployeeService = require("../models/employeeService.model");
const { encryptPhone, maskPhone, hashPhone } = require("../utils/crypto");
const { encryptAadhaar, hashAadhaar, maskAadhaar } = require('../utils/aadharUtils');

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      employeeId: user.empId,
      role: user.role
    },
    process.env.JWT_KEY,
    { expiresIn: '7d' }
  );
};

exports.registerEmployee = async (req, res) => {
  try {
    const { fullname, phoneNo, address, aadhaarNo, role, services } = req.body;

    // 1. Validate required fields
    if (!fullname || !phoneNo || !address || !aadhaarNo) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (role !== ROLES.SINGLE_EMPLOYEE) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // 2. Validate address structure
    if (!address.city || !address.state || !address.pincode) {
      return res.status(400).json({ message: "Address must include city, state, and pincode" });
    }
    //Validate services as you already do...
    const encryptedPhone = encryptPhone(phoneNo);
    const maskedPhone = maskPhone(phoneNo);
    const phoneHash = hashPhone(phoneNo);
    //Aadhaar Secure Storage
    const encryptedAadhaar = encryptAadhaar(aadhaarNo);
    const aadhaarHash = hashAadhaar(aadhaarNo);
    const maskedAahaar = maskAadhaar(aadhaarNo);
    // 3. Check duplicate employee
    const existingEmployee = await SingleEmployee.findOne({
      $or: [{ phoneHash }, { aadhaarHash }],
    });

    if (existingEmployee) {
      return res.status(400).json({ message: "Employee already registered with this phone or Aadhaar" });
    }

    // 4. SERVICE VALIDATION (NEW PART)
    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ message: "Select at least 1 service" });
    }

    if (services.length > 3) {
      return res.status(400).json({ message: "Maximum 3 services allowed" });
    }

    // Validate service IDs exist
    const validServices = await DomainService.find({ _id: { $in: services } });

    if (validServices.length !== services.length) {
      return res.status(400).json({ message: "One or more services not found" });
    }
    // 5. Create new employee
    const employee = await SingleEmployee.create({
      fullname,
      phoneNo: encryptedPhone,
      phoneMasked: maskedPhone,
      phoneHash,
      address,
      aadhaarNo: encryptAadhaar,
      aadhaarMasked: maskedAahaar,
      aadhaarHash,
      role: ROLES.SINGLE_EMPLOYEE
    });

    // 6. Create EmployeeService entry
    await EmployeeService.create({
      employeeId: employee._id,   // store the userId
      capableservice: services    // store the selected 1–3 service IDs
    });

    // 7. Return response with token
    res.status(201).json({
      id: employee._id,
      empId: employee.empId,
      fullname: employee.fullname,
      phoneNo: employee.phoneMasked,
      address: employee.address,
      aadhaarNo: employee.aadhaarMasked, // only last 4 digits
      role: employee.role,
      verified: employee.verified,
      servicesAssigned: services,
      token: generateToken(employee),
    });

  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({
      message: "Error during registration",
      error: err.message,
    });
  }
};
//Accept request by the singleEmployee
exports.acceptTeamRequest = async (req, res) => {
  try {
    const loggedInEmpId = req.employee.empId;
    const employee = await SingleEmployee.findOne({ empId: loggedInEmpId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    if (employee.teamAccepted) {
      return res.status(400).json({ message: "Team request already accepted" });
    }
    //update employee status
    employee.teamAccepted = true;
    await employee.save();

    //Remove from pending requests in all multipleEmployee
    await MultipleEmployee.updateMany(
      { pendingRequests: loggedInEmpId },
      {
        $pull: { pendingRequests: loggedInEmpId },
        $addToSet: { members: loggedInEmpId }
      }
    );

    res.status(200).json({
      message: "Team request Accepted Successfully",
      empId: employee.empId,
      teamAccepted: true
    });
  }
  catch (err) {
    console.error("acceptTeamRequest error:", err.message);
    res.status(500).json({ message: "Error accepting request", error: err.message });
  }
}

exports.rejectTeamRequest = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ message: "teamId is required" });
    }
    const team = await MultipleEmployee.findOne({ TeamId: teamId });
    if (!team) {
      return res.status(400).json({ message: "Team not found" });
    }
    await MultipleEmployee.updateOne(
      { TeamId: teamId },
      { $pull: { pendingRequests: loggedInEmp } },
    )
    res.status(200).json({
      success: true,
      message: "Request reject successfully",
      rejectFrom: teamId,
    })
  } catch (err) {
    console.error("rejectTeamRequest error:", err.message);
    res.status(500).json({ message: "Error rejecting request", error: err.message });
  }
}

exports.getTeamRequest=async(req,res)=>{
  try{
    const loggedInEmp=req.employee;
    const team=await MultipleEmployee.find(
      {pendingRequests:loggedInEmp},
      {teamId:1,storeName:1,ownerName:1,pendingRequests:1},
    );
    return res.status(200).json({message:"successfully fetch the data",team});
  }
  catch(err){
    console.error("Get Team request",err.message);
    res.status(500).json({message:"Error fetching request",error:err.message});
  }
}