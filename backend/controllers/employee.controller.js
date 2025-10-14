const SingleEmployee = require('../models/singleEmployee');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

exports.registerEmployee = async (req, res) => {
  const { fullname, phoneNo, address, aadhaarNo } = req.body;

  // Validate required fields
  if (!fullname || !phoneNo || !address || !aadhaarNo) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Check if employee already exists
    const existingEmployee = await SingleEmployee.findOne({ phoneNo });
    if (existingEmployee) {
      return res.status(400).json({ message: "Employee is already registered" });
    }

    // Create new employee
    const employee = await SingleEmployee.create({
      fullname,
      phoneNo,
      address,
      aadhaarNo,
    });

    // Respond with JWT token
    res.status(201).json({
      id: employee._id,
      fullname: employee.fullname,
      phoneNo: employee.phoneNo,
      address: employee.address,
      token: generateToken(employee._id),
    });
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({
      message: "Error during registration",
      error: err.message,
    });
  }
};
