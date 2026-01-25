const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const AppError = require("../utils/AppError");

exports.userProtect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next(new AppError("Authorization token missing", 401));
    }

    const token = authHeader.split(" ")[1];
    
    if (!token) {
      return next(new AppError("Malformed token", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_KEY);

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return next(new AppError("Invalid token", 401));
    }

    const user = await User.findById(decoded.id)
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    req.user = user;
    req.userId = user._id;
    req.role=user.role;
    next();
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};
