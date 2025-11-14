const multipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee.model");
const Shop = require("../models/toolshop.model");
const jwt=require("jsonwebtoken");

exports.protect = async (req, res, next) => {
  try {
    // Extract token
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No authorization token found" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    // Find user by decoded.id (Mongo _id)
    let employee =
      (await SingleEmployee.findById(decoded.id)) ||
      (await multipleEmployee.findById(decoded.id)) ||
      (await Shop.findById(decoded.id));

    if (!employee) {
      return res.status(404).json({ message: "User not found" });
    }

    // Attach to request
    req.employee = employee;          // full user data
    req.employeeId = decoded.employeeId; // empId, TeamId, or shopId
    req.role = decoded.role;

    next();

  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
};
