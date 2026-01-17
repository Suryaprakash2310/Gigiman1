const jwt = require('jsonwebtoken');
const MultipleEmployee = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee.model');
const ROLES = require('../enum/role.enum');
const DomainService = require('../models/domainservice.model')
const EmployeeService = require("../models/employeeService.model");
const { maskPhone } = require('../utils/crypto');
const axios = require('axios');

// Generate JWT token
const generateToken = (emp) => {
  return jwt.sign(
    {
      id: emp._id,
      employeeId: emp.empId,
      role: emp.role
    },
    process.env.JWT_KEY,
    { expiresIn: '7d' }
  );
};
//registeration for multiple employee
exports.multipleEmployeeRegister = async (req, res) => {
  try {
    const { storeName, ownerName, latitude, longitude, phoneNo, role, services } = req.body;

    // 1. Required fields
    if (!storeName || !ownerName || !latitude || !longitude || !phoneNo) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // 2. Role validation
    if (role !== ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const maskedPhone = maskPhone(phoneNo);
    // 3. Check duplicate phone
    const existingEmployee = await MultipleEmployee.findOne({ phoneNo });
    if (existingEmployee) {
      return res.status(400).json({ message: "Employee already registered" });
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
      storeLocation: address,
      phoneNo,
      phoneMasked: maskedPhone,
      role: ROLES.MULTIPLE_EMPLOYEE,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      }
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

//toglependingrequest
exports.requestToAddMember = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
    const { empId } = req.body;

    if (!empId) {
      return res.status(400).json({ message: "Employee ID is required" });
    }

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId });
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const employee = await SingleEmployee.findOne({ empId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (employee.teamAccepted) {
      return res.status(400).json({ message: "Employee already in a team" });
    }

    const empObjectId = employee._id;

    const alreadyRequested = team.pendingRequests.some(id =>
      id.equals(empObjectId)
    );

    if (alreadyRequested) {
      team.pendingRequests.pull(empObjectId);
      await team.save();

      return res.status(200).json({
        success: true,
        action: "removed",
        message: "Request removed"
      });
    }

    team.pendingRequests.push(empObjectId);
    await team.save();

    return res.status(200).json({
      success: true,
      action: "sent",
      message: "Request sent"
    });

  } catch (err) {
    console.error("requestToAddMember:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

//Remove a singleEmployee from the logged in MultipleEmployee's team
exports.removeMembersFromTeam = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
    const { empId } = req.body;

    if (loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(403).json({ message: "Only MultipleEmployee can remove members" });
    }

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId });
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const employee = await SingleEmployee.findOne({ empId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const empObjectId = employee._id;

    const index = team.members.findIndex(id =>
      id.equals(empObjectId)
    );

    if (index === -1) {
      return res.status(400).json({ message: "Employee not in your team" });
    }

    team.members.splice(index, 1);
    await team.save();

    employee.teamAccepted = false;
    await employee.save();

    return res.status(200).json({
      success: true,
      message: `${empId} removed successfully`
    });

  } catch (err) {
    console.error("removeMembersFromTeam:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

// Get team status (members + pending requests)
exports.getTeamStatus = async (req, res) => {
  try {
    const loggedInEmp = req.employee;

    if (loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return res.status(403).json({ message: "Access denied" });
    }

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId })
      .populate("members", "empId fullname teamAccepted")
      .populate("pendingRequests", "empId fullname");

    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    return res.status(200).json({
      success: true,
      teamId: team.TeamId,
      members: team.members,
      pendingRequests: team.pendingRequests
    });

  } catch (err) {
    console.error("getTeamStatus:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.SearchSingleEmployee = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
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

exports.getpendingDetails = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
    const team = await MultipleEmployee.findOne({ _id: loggedInEmp._id })
      .populate("pendingRequests", "fullName empId teamAccepted")
      .populate("members", "fullName empId teamAccepted")
    if (!team) {
      return res.status(400).json({ message: "team not found" });
    }
    res.status(200).json({
      success: true,
      team,
    })
  }
  catch (err) {
    return res.status(500).json({ message: "server Error" });
  }
}
exports.updateTeamMembers = async (req, res) => {
  try {
    const loggedInEmp = req.employee;
    const { leaderEmpId, helperEmpIds } = req.body;

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId });
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    if (leaderEmpId) {
      const leader = await SingleEmployee.findOne({ empId: leaderEmpId });
      if (!leader) {
        return res.status(404).json({ message: "Leader not found" });
      }
      team.leader = leader._id;
    }

    if (helperEmpIds?.length) {
      const helpers = await SingleEmployee.find({
        empId: { $in: helperEmpIds }
      });

      if (helpers.length !== helperEmpIds.length) {
        return res.status(404).json({ message: "Some helpers not found" });
      }

      team.helpers = helpers.map(h => h._id);
    }

    await team.save();

    return res.status(200).json({
      success: true,
      message: "Team roles updated"
    });

  } catch (err) {
    console.error("updateTeamMembers:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};
