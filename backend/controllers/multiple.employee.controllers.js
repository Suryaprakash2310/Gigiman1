const jwt = require('jsonwebtoken');
const MultipleEmployee = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee.model');
const ROLES = require('../enum/role.enum');
const DomainService = require('../models/domainservice.model')
const EmployeeService = require("../models/employeeService.model");
const { maskPhone } = require('../utils/crypto');
const axios = require('axios');
const MAP_BOX_TOKEN = process.env.MAP_BOX_TOKEN; 

// Generate JWT token
const generateToken = (emp) => {
  return jwt.sign(
    {
      id: emp._id,
      TeamId: emp.TeamId,
      role: emp.role
    },
    process.env.JWT_KEY,
    { expiresIn: '7d' }
  );
};
//registeration for multiple employee
exports.multipleEmployeeRegister = async (req, res, next) => {
  try {
    const { storeName, ownerName, latitude, longitude, phoneNo, role, services } = req.body;

    // 1. Required fields
    if (!storeName || !ownerName || !latitude || !longitude || !phoneNo) {
      return next(new AppError("All fields are required", 400));
    }

    // 2. Role validation
    if (role !== ROLES.MULTIPLE_EMPLOYEE) {
      return next(new AppError("Invalid role", 400));
    }
    const maskedPhone = maskPhone(phoneNo);
    // 3. Check duplicate phone
    const existingEmployee = await MultipleEmployee.findOne({ phoneNo });
    if (existingEmployee) {
      return next(new AppError("Employee already registered", 400));
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

    // 4. Validate services
    if (!Array.isArray(services) || services.length < 1) {
      return next(new AppError("Select at least 1 service", 400));
    }

    if (services.length > 3) {
      return next(new AppError("Maximum 3 services allowed", 400));
    }

    // Validate serviceIds exist
    const validServices = await DomainService.find({ _id: { $in: services } });
    if (validServices.length !== services.length) {
      return next(new AppError("One or more invalid services selected", 400));
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
      role: employee.role,
      token: generateToken(employee)
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

//display the singleEmployee to members List
exports.showSingleEmployee = async (req, res, next) => {
  try {
    const LoggedInemp = req.employee;//Logged in employee
    //Check the role the employee is multiple employee or not
    if (LoggedInemp.role != ROLES.MULTIPLE_EMPLOYEE) {
      return next(new AppError("Only multi employee can view single employee list", 403));
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
    next(err); //let Global error handler deal with it
  }
}

//toglependingrequest
exports.requestToAddMember = async (req, res, next) => {
  try {
    const loggedInEmp = req.employee;
    const { empId } = req.body;

    if(loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return next(new AppError("Only MultipleEmployee can send requests", 403));
    }

    if (!empId) {
      return next(new AppError("Employee ID is required", 400));
    }

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId });
    if (!team) {
      return next(new AppError("Team not found", 404));
    }

    const employee = await SingleEmployee.findOne({ empId });
    if (!employee) {
      return next(new AppError("Employee not found", 404));
    }

    if (employee.teamAccepted) {
      return next(new AppError("Employee already in a team", 400));
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
    next(err); //let Global error handler deal with it
  }
};


//Remove a singleEmployee from the logged in MultipleEmployee's team
exports.removeMembersFromTeam = async (req, res, next) => {
  try {
    const loggedInEmp = req.employee;
    const { empId } = req.body;

    if (loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return next(new AppError("Only MultipleEmployee can remove members", 403));
    }

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId });
    if (!team) {
      return next(new AppError("Team not found", 404));
    }

    const employee = await SingleEmployee.findOne({ empId });
    if (!employee) {
      return next(new AppError("Employee not found", 404));
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
    next(err); //let Global error handler deal with it
  }
};

// Get team status (members + pending requests)
exports.getTeamStatus = async (req, res, next) => {
  try {
    const loggedInEmp = req.employee;

    if (loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return next(new AppError("Access denied", 403));
    }

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId })
      .populate("members", "empId fullname teamAccepted")
      .populate("pendingRequests", "empId fullname");

    if (!team) {
      return next(new AppError("Team not found", 404));
    }

    return res.status(200).json({
      success: true,
      teamId: team.TeamId,
      members: team.members,
      pendingRequests: team.pendingRequests
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.SearchSingleEmployee = async (req, res, next) => {
  try {
    const loggedInEmp = req.employee;
    if (loggedInEmp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return next(new AppError("Only MultipleEmployee can view team status", 403));
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
    next(err); //let Global error handler deal with it
  }
}

exports.getpendingDetails = async (req, res, next) => {
  try {
    const loggedInEmp = req.employee;
    const team = await MultipleEmployee.findOne({ _id: loggedInEmp._id })
      .populate("pendingRequests", "fullName empId teamAccepted")
      .populate("members", "fullName empId teamAccepted")
    if (!team) {
      return next(new AppError("team not found", 400));
    }
    res.status(200).json({
      success: true,
      team,
    })
  }
  catch (err) {
    next(err); //let Global error handler deal with it
  }
}
exports.updateTeamMembers = async (req, res, next) => {
  try {
    const loggedInEmp = req.employee;
    const { leaderEmpId, helperEmpIds } = req.body;

    const team = await MultipleEmployee.findOne({ TeamId: loggedInEmp.TeamId });
    if (!team) {
      return next(new AppError("Team not found", 404));
    }

    if (leaderEmpId) {
      const leader = await SingleEmployee.findOne({ empId: leaderEmpId });
      if (!leader) {
        return next(new AppError("Leader not found", 404));
      }
      team.leader = leader._id;
    }

    if (helperEmpIds?.length) {
      const helpers = await SingleEmployee.find({
        empId: { $in: helperEmpIds }
      });

      if (helpers.length !== helperEmpIds.length) {
        return next(new AppError("Some helpers not found", 404));
      }

      team.helpers = helpers.map(h => h._id);
    }

    await team.save();

    return res.status(200).json({
      success: true,
      message: "Team roles updated"
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

// GET MY TEAM MEMBERS

  exports.getTeamMembers = async (req, res, next) => {
  try {
    const emp = req.employee;

    if (emp.role !== ROLES.MULTIPLE_EMPLOYEE) {
      return next(new AppError("Unauthorized", 403));
    }

    const team = await MultipleEmployee.findById(emp._id)
      .populate("members", "fullname empId phoneNo");

    if (!team) {
      return next(new AppError("Team not found", 404));
    }

    return res.status(200).json({
      members: team.members,
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

