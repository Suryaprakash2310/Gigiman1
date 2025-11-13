const jwt = require('jsonwebtoken');
const MultipleEmployee = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee');
const ROLES = require('../enum/role.model');

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

exports.multipleEmployeeRegister = async (req, res) => {
    const { storeName, ownerName, gstNo, storeLocation, phoneNo, role } = req.body;

    // Validate required fields
    if (!storeName || !ownerName || !gstNo || !storeLocation || !phoneNo) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        // Check if employee already exists (by phoneNo or GST)
        const existingEmployee = await MultipleEmployee.findOne({ $or: [{ phoneNo }, { gstNo }] });
        if (existingEmployee) {
            return res.status(400).json({ message: "Employee is already registered" });
        }
        if (!Object.values(ROLES).includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }
        const employeeRole = ROLES.MULTIPLE_EMPLOYEE;
        // Create new MultipleEmployee
        const employee = await MultipleEmployee.create({
            storeName,
            ownerName,
            gstNo,
            storeLocation,
            phoneNo,
            role: employeeRole
        });

        //  Respond with employee info + JWT token
        res.status(201).json({
            id: employee._id,
            TeamId: employee.TeamId,
            storeName: employee.storeName,
            ownerName: employee.ownerName,
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


//request singleEmployee to members List
exports.requestToAddMember = async (req, res) => {

    try {
        const loggedInUser = req.employee; // Logged in user
        const { empId } = req.body;
        // Check role
        if (loggedInUser.role !== 'MultipleEmployee') {
            return res.status(403).json({ message: "Only MultipleEmployee can add members" });
        }
        if (!empId) {
            return res.status(400).json({ message: "empId is required" });
        }
        const team = await MultipleEmployee.findOne({ TeamId: loggedInUser });
        if (!team) {
            return res.status(400).json({ message: "Team not found" });
        }
        const singleEmployee = await SingleEmployee.findOne({ empId });
        if (!singleEmployee) {
            return res.status(400).json({ message: "single Employee not found" });
        }
        if (team.members.includes(empId)) {
            return res.status(400).json({ message: "Employee already in team" });
        }
        if (!member.teamAccepted) {
            return res.status(400).json({ message: "Employee has not accepted the team request yet" });
        }
        if (team.pendingRequests.includes(empId))
            return res.status(400).json({ message: "Request already sent" });
        team.pendingRequests.push(empId);
        await team.save();
        res.status(200).json({
            message: `Request sent to ${empId}. Waiting for approval.`,
            team,
        });
    }
    catch (err) {
        console.error("Error adding member:", err.message);
        res.status(500).json({ message: "Error adding member", error: err.message });
    }
}

//Remove a singleEmployee from the logged in MultipleEmployee's team

exports.removeMembersFromTeam = async (req, res) => {
    try {
        const loggedInEmpId = req.employee;
        const { empId } = req.body;
        //Check role
        if (loggedInEmpId.role != 'MultipleEmployee') {
            return res.status(403).json({ message: "Only MultipleEmployee can remove Members" });
        }
        if (!empId) {
            return res.status(400).json({ message: "empId is required" });
        }
        //Get the team of the logged-in MultipleEmployee
        const team = await MultipleEmployee.findOne({ TeamId: loggedInEmpId.TeamId });
        if (!team) {
            return res.status(404).json({ message: "Team not found for this user" });
        }
        //Find the Single Employee
        const employee = await SingleEmployee.findOne({ empId });
        if (!employee) {
            return re.status(404).json({ message: "Employee not found" });
        }
        //check if the employee is actually a member
        const memberIndex = team.members.indexOf(empId);
        if (memberIndex === -1) {
            return res.status(400).json({ messgae: "Employee is not a member of this team" });
        }
        //Remove employee from team
        team.members.splice(memberIndex, 1);
        await team.save();

        //Rest teamAccepted to false
        employee.teamAccepted = false;
        await employee.save();

        res.status(200).json({
            message: `Employee ${empId} removed from your team successfully.`,
            team,
        });
    }
    catch (err) {
        console.error("Error removing members", err.message);
        res.status(500).json({ message: "Error removing member", error: err.message });
    }
}