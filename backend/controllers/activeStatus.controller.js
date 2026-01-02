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
    const empType = req.role;

    const modelName = roleModelMap[empType];
    const Model = modelMap[modelName];

    if (!Model) {
      return res.status(400).json({ message: "Invalid employee type" });
    }

    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be boolean",
      });
    }

    const updatePayload = { isActive };
    if (modelName === "SingleEmployee") {
      if (!isActive) {
        // Going offline → clear availability locks
        updatePayload.availabilityStatus = "AVAILABLE";
        updatePayload.blockedUntil = null;
      }
    }

    /* ======================================================
       UPDATE ENTITY
    ====================================================== */
    const emp = await Model.findByIdAndUpdate(
      empId,
      updatePayload,
      { new: true }
    );

    if (!emp) {
      return res.status(404).json({ message: "Entity not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Active status updated successfully",
      id: emp._id,
      role: empType,
      isActive: emp.isActive,
      availabilityStatus: emp.availabilityStatus ?? undefined,
    });

  } catch (err) {
    console.error("updateActiveStatus error:", err.message);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};
