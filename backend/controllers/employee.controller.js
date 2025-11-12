const ROLES = require('../enum/role.model');
const multipleEmployeeModel = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee');
const jwt = require('jsonwebtoken');

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
    const { fullname, phoneNo, address, aadhaarNo, role } = req.body;

    //  Validate required fields
    if (!fullname || !phoneNo || !address || !aadhaarNo) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }


    //  Validate address structure
    if (!address.city || !address.state || !address.pincode) {
      return res.status(400).json({ message: "Address must include city, state, and pincode" });
    }

    //  Prevent duplicate employee
    const existingEmployee = await SingleEmployee.findOne({
      $or: [{ phoneNo }, { aadhaarNo }],
    });

    if (existingEmployee) {
      return res.status(400).json({ message: "Employee already registered with this phone or Aadhaar" });
    }
    const employeeRole = ROLES.SINGLE_EMPLOYEE;
    //  Create new employee (auto-generates empId)
    const employee = await SingleEmployee.create({
      fullname,
      phoneNo,
      address,
      aadhaarNo,
      role: ROLES.SINGLE_EMPLOYEE 
    });

    //  Return response with token
    res.status(201).json({
      id: employee._id,
      empId: employee.empId,
      fullname: employee.fullname,
      phoneNo: employee.phoneNo,
      address: employee.address,
      role: employee.role,
      verified: employee.verified,
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
    await multipleEmployeeModel.updateMany(
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