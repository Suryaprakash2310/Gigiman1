const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
exports.tempProtect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Temp token missing" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_KEY);

    if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
      return res.status(401).json({ message: "Invalid temp token" });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.userId = user._id;
    req.user = user;

    next();
  } catch (err) {
    return res.status(401).json({ message: "Temp token expired or invalid" });
  }
};
