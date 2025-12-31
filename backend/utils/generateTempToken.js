const jwt=require('jsonwebtoken');

module.exports = (userId) => {
  return jwt.sign(
    {
      userId,
      stage: "PROFILE_PENDING",
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );
};