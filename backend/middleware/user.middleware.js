// middleware/tempProtect.js
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

exports.userProtect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Temp token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_KEY);

    if (decoded.type !== "TEMP_PROFILE") {
      return res.status(403).json({ message: "Invalid temp token" });
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
