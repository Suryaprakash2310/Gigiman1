const ROLES = require('../enum/role.enum');
const MultipleEmployee = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee.model');
const jwt = require('jsonwebtoken');
const DomainService = require("../models/domainservice.model");
const EmployeeService = require("../models/employeeService.model");
const { maskPhone } = require("../utils/crypto");
const { encryptAadhaar, hashAadhaar, maskAadhaar } = require('../utils/aadharUtils');
const axios = require('axios');
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
    const { fullname, phoneNo, aadhaarNo, latitude, longitude, role, services } = req.body;

    // 1. Validate required fields
    if (!fullname || !phoneNo) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (role !== ROLES.SINGLE_EMPLOYEE) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const MAP_BOX_TOKEN = process.env.MAP_BOX_TOKEN;

    const maskedPhone = maskPhone(phoneNo);
    //Aadhaar Secure Storage
    const encryptedAadhaar = encryptAadhaar(aadhaarNo);
    const aadhaarHash = hashAadhaar(aadhaarNo);
    const maskedAahaar = maskAadhaar(aadhaarNo);
    // 3. Check duplicate employee
    const existingEmployee = await SingleEmployee.findOne({
      $or: [{ phoneNo }, { aadhaarHash }],
    });

    if (existingEmployee) {
      return res.status(400).json({
        message: "Employee already registered with this phone or Aadhaar",
      });
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
      console.log("Resolved address:", address);
    }
    // 4. SERVICE VALIDATION (NEW PART)
    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ message: "Select at least 1 service" });
    }

    if (services.length > 3) {
      return res.status(400).json({ message: "Maximum 3 services allowed" });
    }

    const validServices = await DomainService.find({
      _id: { $in: services },
    });

    if (validServices.length !== services.length) {
      return res.status(400).json({ message: "One or more services not found" });
    }

    // Create employee  
    const employee = await SingleEmployee.create({
      fullname,
      phoneNo,
      phoneMasked: maskedPhone,
      address,
      location: {
        type: "Point",
        coordinates: [longitude, latitude]
      },
      aadhaarNo: encryptedAadhaar,
      aadhaarMasked: maskedAahaar,
      aadhaarHash,
      role: ROLES.SINGLE_EMPLOYEE,
      isActive: false,
      availabilityStatus: "AVAILABLE"
    });


    // 6. Create EmployeeService entry
    await EmployeeService.create({
      employeeId: employee._id,
      capableservice: services,
    });

    // Response  
    res.status(201).json({
      id: employee._id,
      empId: employee.empId,
      fullname: employee.fullname,
      phoneNo: employee.phoneMasked,
      address: employee.address,
      aadhaarNo: employee.aadhaarMasked,
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
      { $pull: { pendingRequests: loggedInEmp.empId } }
    );

    return res.status(200).json({
      success: true,
      message: "Request rejected successfully",
      rejectFrom: teamId,
    });

  } catch (err) {
    console.error("rejectTeamRequest error:", err.message);
    return res.status(500).json({
      message: "Error rejecting request",
      error: err.message,
    });
  }
};


exports.getTeamRequest = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
    const team = await MultipleEmployee.find(
      { pendingRequests: loggedInEmp.empId },
      { teamId: 1, storeName: 1, ownerName: 1, pendingRequests: 1 },
    );
    return res.status(200).json({ message: "successfully fetch the data", team });
  }
  catch (err) {
    console.error("Get Team request", err.message);
    res.status(500).json({ message: "Error fetching request", error: err.message });
  }
}