const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const Admin = require("../models/admin.model");
const Shop = require("../models/toolshop.model");
const ROLES = require("../enum/role.enum");
const AppError = require("../utils/AppError");

const MODEL_MAP = {
  [ROLES.SINGLE_EMPLOYEE]: SingleEmployee,
  [ROLES.MULTIPLE_EMPLOYEE]: MultipleEmployee,
  [ROLES.TOOL_SHOP]: Shop,
  [ROLES.ADMIN]: Admin,
  [ROLES.SUPER_ADMIN]: Admin,
  [ROLES.USER]: User
};

exports.anyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new AppError("Authorization token missing", 401));
    }

    const token = authHeader.split(" ")[1];
    if (!token || token === "null" || token === "undefined") {
      return next(new AppError("Malformed token", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_KEY);
    if (!decoded || !decoded.id || !decoded.role) {
      return next(new AppError("Invalid token payload", 401));
    }

    const model = MODEL_MAP[decoded.role];
    if (!model) {
      return next(new AppError("Invalid role in token", 401));
    }

    const account = await model.findById(decoded.id);
    if (!account) {
      return next(new AppError("Account not found", 404));
    }

    if (decoded.role === ROLES.USER) {
      req.user = account;
      req.userId = account._id;
    } else {
      req.employee = account;
      req.employeeId = account._id;
    }
    
    req.role = decoded.role;
    next();
  } catch (err) {
    next(err);
  }
};
