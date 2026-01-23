const jwt = require("jsonwebtoken");
const multipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee.model");
const Shop = require("../models/toolshop.model");
const Admin = require("../models/admin.model");

exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization header missing or invalid" });
    }

    const token = authHeader.split(" ")[1];

    // Block bad tokens before verify
    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({ message: "Malformed token" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    let employee =
      (await SingleEmployee.findById(decoded.id)) ||
      (await multipleEmployee.findById(decoded.id)) ||
      (await Shop.findById(decoded.id)) ||
      (await Admin.findById(decoded.id));

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Attach to request
    req.employee = employee;
    req.employeeId = employee._id;
    req.role = employee.role;

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
