const multipleEmployee = require("../models/multipleEmployee.model");
const SingleEmployee = require("../models/singleEmployee.model");
const Shop = require("../models/toolshop.model");
const jwt = require("jsonwebtoken");

exports.protect = async (req, res, next) => {
  try {
    // Extract token
    const token = req.headers.authorization?.split(" ")[1];
    // console.log("Authorization header:", req.headers.authorization);
    // console.log("Extracted token:", token);
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
      console.log("here is th eerror")
      return res.status(404).json({ message: "employee not found" });
    }

    // Attach to request
    req.employee = employee;
    req.employeeId = employee._id;
    req.role = employee.role;


    next();

  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
};