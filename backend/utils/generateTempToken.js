const jwt=require('jsonwebtoken');

require('dotenv').config();
module.exports = (userId) => {
  return jwt.sign(
    {
      userId,
      stage: "PROFILE_PENDING",
    },
    process.env.JWT_KEY,
    { expiresIn: "60m" }
  );
};