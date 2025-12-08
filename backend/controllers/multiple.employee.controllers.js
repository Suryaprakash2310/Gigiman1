const jwt = require('jsonwebtoken');
const MultipleEmployee = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee.model');
const ROLES = require('../enum/role.enum');
const DomainService = require('../models/domainservice.model')
const EmployeeService = require("../models/employeeService.model");
const { encryptPhone, maskPhone, hashPhone } = require('../utils/crypto');
// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

//registeration for multiple employee
exports.multipleEmployeeRegister = async (req, res) => {
  try {
    const { storeName, ownerName, gstNo, storeLocation, phoneNo, role, services } = req.body;

    // 1. Required fields
    if (!storeName || !ownerName || !gstNo || !storeLocation || !phoneNo) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // 2. Role validation
    if (role !== ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(400).json({ message: "Invalid role" });
    }
    // ENCRYPT + MASK + HASH
    const encryptedphone = encryptPhone(phoneNo);
    const maskedPhone = maskPhone(phoneNo);
    const phoneHash = hashPhone(phoneNo);
    // 3. Check duplicate phone/gst
    const existingEmployee = await MultipleEmployee.findOne({
      $or: [{ phoneHash }, { gstNo }]
    });

    if (existingEmployee) {
      return res.status(400).json({ message: "Employee already registered" });
    }

    // 4. Validate services
    if (!Array.isArray(services) || services.length < 1) {
      return res.status(400).json({ message: "Select at least 1 service" });
    }

    if (services.length > 3) {
      return res.status(400).json({ message: "Maximum 3 services allowed" });
    }

    // Validate serviceIds exist
    const validServices = await DomainService.find({ _id: { $in: services } });
    if (validServices.length !== services.length) {
      return res.status(400).json({ message: "One or more services not found" });
    }

    // 5. Create MultipleEmployee
    const employee = await MultipleEmployee.create({
      storeName,
      ownerName,
      gstNo,
      storeLocation,
      phoneNo: encryptedphone,
      phoneMasked: maskedPhone,
      phoneHash,
      role: ROLES.MULTIPLE_EMPLOYEE
    });

    // 6. Save MultipleEmployee services (same as SingleEmployee)
    await EmployeeService.create({
      employeeId: employee._id,
      capableservice: services
    });

    // 7. Return response
    res.status(201).json({
      success: true,
      id: employee._id,
      TeamId: employee.TeamId,
      storeName: employee.storeName,
      ownerName: employee.ownerName,
      phoneNo: employee.phoneMasked,
      servicesAssigned: services,
      token: generateToken(employee)
    });

  } catch (err) {
    console.error("MultipleEmployee Registration Error:", err.message);
    res.status(500).json({
      message: "Error during registration",
      error: err.message,
    });
  }
};

//display the singleEmployee to members List
exports.showSingleEmployee = async (req, res) => {
  try {
    const LoggedInemp = req.employee;//Logged in employee
    //Check the role the employee is multiple employee or not
    if (LoggedInemp.role != ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(403).json({ message: "Only multi employee can view single employee list" });
    }
    //get all single employees
    const employees = await SingleEmployee.find().select("empId fullname teamAccepted");
    //List the single employees
    res.status(200).json({
      message: "Registered single employees list",
      employees,
    })
  }
  catch (err) {
    console.error("Error for showSingleEmployee", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

//request singleEmployee to members List
exports.requestToAddMember = async (req, res) => {

  try {
    const loggedInemp = req.employee; // Logged in employee
    const { empId } = req.body;
    // Check role
    if (loggedInemp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(403).json({ message: "Only MultipleEmployee can add members" });
    }
    //empId required
    if (!empId) {
      return res.status(400).json({ message: "empId is required" });
    }
    //Find team
    const team = await MultipleEmployee.findOne({ TeamId: loggedInemp });
    if (!team) {
      return res.status(400).json({ message: "Team not found" });
    }
    //Find single employee
    const singleEmployee = await SingleEmployee.findOne({ empId });
    if (!singleEmployee) {
      return res.status(400).json({ message: "single Employee not found" });
    }
    //Already members
    if (team.members.includes(empId)) {
      return res.status(400).json({ message: "Employee already in team" });
    }
    //check acceptance
    if (!singleEmployee.teamAccepted) {
      return res.status(400).json({ message: "Employee has not accepted the team request yet" });
    }
    //Already requested?
    if (team.pendingRequests.includes(empId))
      return res.status(400).json({ message: "Request already sent" });
    //send request
    team.pendingRequests.push(empId);
    await team.save();
    res.status(200).json({
      message: `Request sent to ${empId}. Waiting for approval.`,
      team,
    });
  }
  catch (err) {
    console.error("Error adding member:", err.message);
    res.status(500).json({ message: "Error adding member", error: err.message });
  }
}

//Remove a singleEmployee from the logged in MultipleEmployee's team
exports.removeMembersFromTeam = async (req, res) => {
  try {
    const loggedInEmpId = req.employee;//Logged in employee
    const { empId } = req.body;
    //Check role
    if (loggedInEmpId.role != ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(403).json({ message: "Only MultipleEmployee can remove Members" });
    }
    if (!empId) {
      return res.status(400).json({ message: "empId is required" });
    }
    //Get the team of the logged-in MultipleEmployee
    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmpId.TeamId });
    if (!team) {
      return res.status(404).json({ message: "Team not found for this user" });
    }
    //Find the Single Employee
    const employee = await SingleEmployee.findOne({ empId });
    if (!employee) {
      return re.status(404).json({ message: "Employee not found" });
    }
    //check if the employee is actually a member
    const memberIndex = team.members.indexOf(empId);
    if (memberIndex === -1) {
      return res.status(400).json({ messgae: "Employee is not a member of this team" });
    }
    //Remove employee from team
    team.members.splice(memberIndex, 1);
    await team.save();

    //Rest teamAccepted to false
    employee.teamAccepted = false;
    await employee.save();

    res.status(200).json({
      message: `Employee ${empId} removed from your team successfully.`,
      team,
    });
  }
  catch (err) {
    console.error("Error removing members", err.message);
    res.status(500).json({ message: "Error removing member", error: err.message });
  }
}

// Get team status (members + pending requests)
exports.getTeamStatus = async (req, res) => {
  try {
    const loggedInEmp = req.employee;

    if (loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(403).json({ message: "Only MultipleEmployee can view team status" });
    }

    // Find the logged-in user's team
    const team = await MultipleEmployee.findOne({ _id: loggedInEmp._id });

    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    // Fetch member details
    const members = await SingleEmployee.find({
      empId: { $in: team.members }
    }).select("empId fullname");

    // Fetch pending request details
    const pending = await SingleEmployee.find({
      empId: { $in: team.pendingRequests }
    }).select("empId fullname");

    return res.status(200).json({
      success: true,
      teamId: team.TeamId,
      members,
      pendingRequests: pending,
    });

  } catch (err) {
    console.error("Team Status Error:", err.message);
    res.status(500).json({
      message: "Error fetching team status",
      error: err.message,
    });
  }
};

exports.SearchSingleEmployee = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
    if (!loggedInEmp) {
      return res.status(400).json({ message: "Invalid employee Id" });
    }
    if (loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(403).json({ message: "Only MultipleEmployee can view team status" });
    }

    const { q = " " } = req.query;
    const singleemployee = await SingleEmployee.aggregate([
      {
        $match: {
          $or: [
            { empId: { $regex: q, $options: "i" } },
            { fullname: { $regex: q, $options: "i" } }
          ]
        },
      },
      { $sort: { empId: 1 } },
    ])
    res.status(200).json({
      success: true,
      count: singleemployee.length,
      singleemployee,
    })
  }
  catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}