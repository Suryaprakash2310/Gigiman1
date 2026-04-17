const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const AppError = require("../utils/AppError");

exports.tempProtect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next(new AppError("Authorization token missing", 401));
    }

    const token = authHeader.split(" ")[1];
    
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    if (!decoded?.userId) {
      return next(new AppError("Invalid temp token payload", 401));
    }

    if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
      return next(new AppError("Invalid temp token", 401));
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    req.userId = user._id;
    req.user = user;

    next();
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};
