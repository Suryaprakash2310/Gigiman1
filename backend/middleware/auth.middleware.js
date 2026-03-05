const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");

const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const Shop = require("../models/toolshop.model");
const Admin = require("../models/admin.model");

const ROLES = require("../enum/role.enum");

const MODEL_MAP = {
  [ROLES.SINGLE_EMPLOYEE]: SingleEmployee,
  [ROLES.MULTIPLE_EMPLOYEE]: MultipleEmployee,
  [ROLES.TOOL_SHOP]: Shop,
  [ROLES.ADMIN]: Admin,
  [ROLES.SUPER_ADMIN]: Admin,
  [ROLES.CITY_MANAGER]: Admin,
  [ROLES.OPERATIONS_MANAGER]: Admin,
  [ROLES.SUPPORT_EXECUTIVE]: Admin
};


exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new AppError("Authorization token missing", 401));
    }

    const token = authHeader.split(" ")[1];

    // Block bad tokens before verify
    if (!token || token === "null" || token === "undefined") {
      return next(new AppError("Malformed token", 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    if (!decoded || !decoded.id || !decoded.role) {
      return next(new AppError("Invalid token payload", 401));
    }

    const model = MODEL_MAP[decoded.role];
    if (!model) {
      return next(new AppError("Invalid role in token", 401));
    }

    const employee = await model.findById(decoded.id);
    if (!employee) {
      return next(new AppError("Employee not found", 404));
    }

    // Attach to request
    req.employee = employee;
    req.employeeId = employee._id;
    req.role = employee.role;

    next();
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};
