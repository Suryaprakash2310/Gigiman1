const multipleEmployeeModel = require('../models/multipleEmployee.model');
const SingleEmployee = require('../models/singleEmployee');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_KEY, { expiresIn: '7d' });
};

exports.registerEmployee = async (req, res) => {
  try {
    const { fullname, phoneNo, address, aadhaarNo, role } = req.body;

    //  Validate required fields
    if (!fullname || !phoneNo || !address || !aadhaarNo) {
      return res.status(400).json({ message: "All fields are required" });
    }

    //  Validate address structure
    if (!address.city || !address.state || !address.pincode) {
      return res.status(400).json({ message: "Address must include city, state, and pincode" });
    }

    //  Prevent duplicate employee
    const existingEmployee = await SingleEmployee.findOne({
      $or: [{ phoneNo }, { aadhaarNo }],
    });

    if (existingEmployee) {
      return res.status(400).json({ message: "Employee already registered with this phone or Aadhaar" });
    }

    //  Create new employee (auto-generates userId)
    const employee = await SingleEmployee.create({
      fullname,
      phoneNo,
      address,
      aadhaarNo,
      role: role || "SingleEmployee", // default if not passed
    });

    //  Return response with token
    res.status(201).json({
      id: employee._id,
      userId: employee.userId,
      fullname: employee.fullname,
      phoneNo: employee.phoneNo,
      address: employee.address,
      role: employee.role,
      verified: employee.verified,
      token: generateToken(employee._id),
    });

  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({
      message: "Error during registration",
      error: err.message,
    });
  }
};

//Accept request by the singleEmployee

exports.acceptTeamRequest=async(req,res)=>{
  try{
    const loggedInUserId = req.employee.userId; 
    const employee = await SingleEmployee.findOne({ userId: loggedInUserId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    if(employee.teamAccepted){
      return res.status(400).json({message:"Team request already accepted"});
    }
    //update employee status
    employee.teamAccepted=true;
    await employee.save();

    //Remove from pending requests in all multipleEmployee
    await multipleEmployeeModel.updateMany(
      {pendingRequests:loggedInUserId},
      {
        $pull:{pendingRequests:loggedInUserId},
        $addToSet:{members:loggedInUserId}
      }
    );

    res.status(200).json({
      message:"Team request Accepted Successfully",
      userId:employee.userId,
      teamAccepted:true
    });
  }
  catch(err){
     console.error("acceptTeamRequest error:", err.message);
     res.status(500).json({ message: "Error accepting request", error: err.message });
  }
}