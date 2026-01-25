const ROLES = require('../enum/role.enum');
const MultipleEmployee = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee.model');
const jwt = require('jsonwebtoken');
const DomainService = require("../models/domainservice.model");
const EmployeeService = require("../models/employeeService.model");
const { maskPhone } = require("../utils/crypto");
const { encryptAadhaar, hashAadhaar, maskAadhaar } = require('../utils/aadharUtils');
const axios = require('axios');
const AppError = require("../utils/AppError");
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


exports.registerEmployee = async (req, res, next) => {
  try {
    const { fullname, phoneNo, aadhaarNo, latitude, longitude, role, services } = req.body;

    // 1. Validate required fields
    if (!fullname || !phoneNo) {
      return next(new AppError("All fields are required", 400));
    }

    if (role !== ROLES.SINGLE_EMPLOYEE) {
      return next(new AppError("Invalid role", 400));
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
      return next(new AppError("Employee with given phone number or Aadhaar already exists", 409));
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
    // 4. SERVICE VALIDATION (NEW PART)
    if (!Array.isArray(services) || services.length === 0) {
      return next(new AppError("At least one service must be selected", 400));
    }

    if (services.length > 3) {
      return next(new AppError("Maximum 3 services allowed", 400));
    }

    const validServices = await DomainService.find({
      _id: { $in: services },
    });

    if (validServices.length !== services.length) {
      return next(new AppError("One or more services not found", 400));
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
    next(err); //let Global error handler deal with it
  }
};

//Accept request by the singleEmployee
exports.acceptTeamRequest = async (req, res, next) => {
  try {
    const empId = req.employee.empId;

    const employee = await SingleEmployee.findOne({ empId });
    if (!employee) {
      return next(new AppError("Employee not found", 404));
    }

    if (employee.teamAccepted) {
      return next(new AppError("Already in a team", 400));
    }

    const empObjectId = employee._id;

    employee.teamAccepted = true;
    await employee.save();

    await MultipleEmployee.updateMany(
      { pendingRequests: empObjectId },
      {
        $pull: { pendingRequests: empObjectId },
        $addToSet: { members: empObjectId }
      }
    );

    return res.status(200).json({
      success: true,
      message: "Team joined successfully",
      empId
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


exports.rejectTeamRequest = async (req, res, next) => {
  try {
    const { teamId } = req.body;
    const empId = req.employee.empId;

    const employee = await SingleEmployee.findOne({ empId });
    if (!employee) {
      return next(new AppError("Employee not found", 404));
    }

    await MultipleEmployee.updateOne(
      { TeamId: teamId },
      { $pull: { pendingRequests: employee._id } }
    );

    return res.status(200).json({
      success: true,
      message: "Request rejected"
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.getTeamRequest = async (req, res, next) => {
  try {
    const loggedInEmp = req.employee;

    // Enforce role
    if (loggedInEmp.role !== ROLES.SINGLE_EMPLOYEE) {
      return next(new AppError("Access denied: Only single employees can access team requests", 403));
    }

    // If protect already attached SingleEmployee doc, reuse _id
    const employeeId = loggedInEmp._id;

    const teams = await MultipleEmployee.find(
      { pendingRequests: employeeId },
      { TeamId: 1, storeName: 1, ownerName: 1, createdAt: 1 }
    ).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: teams.length,
      teams
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

// GET single employee team details
exports.getMyTeam = async (req, res, next) => {
  try {
    const empId = req.employee.empId;
    if(!empId){
      return next(new AppError("Employee ID missing", 400));
    }

    const employee = await SingleEmployee.findOne({ empId });
    if (!employee || !employee.teamAccepted) {
      return res.status(200).json({
        success: true,
        team: null
      });
    }

    const team = await MultipleEmployee.findOne(
      { members: employee._id },
      { TeamId: 1, storeName: 1, ownerName: 1 }
    );

    return res.status(200).json({
      success: true,
      team
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.leaveTeam = async (req, res, next) => {
  try {
    const empId = req.employee.empId;

    if(!empId){
      return next(new AppError("Employee ID missing", 400));
    }
    const employee = await SingleEmployee.findOne({ empId });
    if (!employee || !employee.teamAccepted) {
      return next(new AppError("Not in any team", 400));
    }

    await MultipleEmployee.updateOne(
      { members: employee._id },
      { $pull: { members: employee._id } }
    );

    employee.teamAccepted = false;
    await employee.save();

    return res.status(200).json({
      success: true,
      message: "You left the team successfully"
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};


