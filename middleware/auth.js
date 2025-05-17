const jwt = require("jsonwebtoken");
require("dotenv").config();
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key"; 
const authMiddleware = (req, res, next) => {
  let token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.userId = decoded.id || decoded.userId;
    next();
  } catch (error) {
    console.error("JWT error:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;
