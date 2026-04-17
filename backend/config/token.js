//Generate JWT token
const jwt = require("jsonwebtoken");
const generateToken = (employee) => {
  return jwt.sign(
    {
      id: employee._id,
      employeeId: employee.employeeId,
      role: employee.role
    },
    process.env.JWT_KEY,

  );

};

module.exports = generateToken;