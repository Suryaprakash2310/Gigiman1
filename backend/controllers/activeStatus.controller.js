const SingleEmployee = require("../models/singleEmployee.model");
const MultipleEmployee = require("../models/multipleEmployee.model");
const ToolShop = require("../models/toolshop.model");
const roleModelMap = require("../utils/roleModelMap");
const AppError = require("../utils/AppError");

const modelMap = {
  SingleEmployee,
  MultipleEmployee,
  ToolShop,
};

exports.updateActiveStatus = async (req, res, next) => {
  try {
    const empId = req.employee._id;
    const empType = req.role;
    const modelName = roleModelMap[empType];
    const Model = modelMap[modelName];

    if (!Model) {
      next(new AppError("Invalid employee role for status update", 400));
    }

    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      next(new AppError("isActive must be a boolean value", 400));
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
      next(new AppError("Employee not found for status update", 404));
    }

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
    next(err);
  }

};
