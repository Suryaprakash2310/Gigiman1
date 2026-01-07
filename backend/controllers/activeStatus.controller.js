const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const roleModelMap = require("../utils/roleModelMap");

const modelMap = {
  SingleEmployee,
  MultipleEmployee,
  ToolShop,
};

exports.updateActiveStatus = async (req, res) => {
  try {
    const empId = req.employee._id;
    //req.role = req.role?.toUpperCase();

    const empType = req.role;

    const modelName = roleModelMap[empType];
    const Model = modelMap[modelName];

    if (!Model) {
      return res.status(400).json({
        success: false,
        message: "Invalid employee type",
      });
    }

    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean value",
      });
    }

    const updatePayload = { isActive };

    //  IMPORTANT FIXES FOR REALTIME FLOW
    if (modelName === "SingleEmployee" && !isActive) {
      updatePayload.availabilityStatus = "AVAILABLE";
      updatePayload.blockedUntil = null;
      updatePayload.offerBookingId = null; // clear stale offer
      updatePayload.socketId = null;       // clear dead socket
    }

    const emp = await Model.findByIdAndUpdate(
      empId,
      updatePayload,
      { new: true }
    );

    if (!emp) {
      return res.status(404).json({
        success: false,
        message: "Entity not found",
      });
    }

    console.log(
      `[STATUS UPDATE] ${modelName} ${empId} → isActive=${emp.isActive}`
    );
    console.log("🔐 AUTH DEBUG");
console.log("employee:", req.employee);
console.log("role:", req.role);
console.log("body:", req.body);


    return res.status(200).json({
      success: true,
      message: "Active status updated successfully",
      id: emp._id,
      role: empType,
      isActive: emp.isActive,
      availabilityStatus:
        modelName === "SingleEmployee"
          ? emp.availabilityStatus
          : undefined,
    });
    

  } catch (err) {
    console.error("updateActiveStatus error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
  
};
