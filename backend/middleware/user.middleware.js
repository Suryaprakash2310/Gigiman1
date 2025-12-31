const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

exports.userProtect = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "No authorization token" });
        }

        const decoded = jwt.verify(token, process.env.JWT_KEY);

        const user = await User.findById(decoded.id).select("-phoneNo"); 
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        req.user = user;
        req.userId = user._id;

        next();

    } catch (err) {
        console.error("User auth error:", err.message);
        return res.status(401).json({ message: "Invalid token" });
    }
};