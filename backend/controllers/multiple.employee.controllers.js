const jwt = require('jsonwebtoken');
const MultipleEmployee = require('../models/multipleEmployee.model');

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

exports.multipleEmployeeRegister = async (req, res) => {
    const { storeName, ownerName, userName, gstNo, storeLocation, phoneNo } = req.body;

    // Validate required fields
    if (!storeName || !ownerName || !userName || !gstNo || !storeLocation || !phoneNo) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Check if employee already exists (by phoneNo or GST)
        const existingEmployee = await MultipleEmployee.findOne({ $or: [{ phoneNo }, { gstNo }, { userName }] });
        if (existingEmployee) {
            return res.status(400).json({ message: "Employee is already registered" });
        }

        // Create new MultipleEmployee
        const employee = await MultipleEmployee.create({
            storeName,
            ownerName,
            userName,
            gstNo,
            storeLocation,
            phoneNo
        });

        //  Respond with employee info + JWT token
        res.status(201).json({
            id: employee._id,
            storeName: employee.storeName,
            ownerName: employee.ownerName,
            userName: employee.userName,
            gstNo: employee.gstNo,
            storeLocation: employee.storeLocation,
            phoneNo: employee.phoneNo,
            token: generateToken(employee._id),
        });

    } catch (err) {
        console.error("MultipleEmployee registration error:", err.message);
        res.status(500).json({ message: "Error during registration", error: err.message });
    }
};
