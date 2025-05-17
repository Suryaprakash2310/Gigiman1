const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

const createToken = (userId) => {
  return jwt.sign({ id: userId }, SECRET_KEY, { expiresIn: "1d" });
};

module.exports = { createToken };
