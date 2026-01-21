const Admin = require('../models/admin.model');
const jwt = require("jsonwebtoken");
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const DomainService = require("../models/domainservice.model");
const cloudinary = require('../config/cloudinary');
const ServiceList = require('../models/serviceList.model');
const mongoose = require('mongoose');
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ message: "Admin not found" });
    }
    const match = await admin.comparePassword(password);
    if (!match) {
      return res.status(400).json({ message: "Invalid password" });
    }
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_KEY,
      { expiresIn: "7d" }
    );


    res.json({
      message: "Admin login successfully",
      token,
      admin: {
        id: admin._id,
        fullname: admin.fullname,
        email: admin.email,
        role: admin.role,
      }
    });
  }
  catch (err) {
    console.error("Admin Login controller error", err.message);
    res.status(500).json({
      message: "server Error",
      error: err.message
    });
  }
}

exports.checkAuth = async (req, res) => {
  if (req.role != 'admin') {
    return res.status(403).json({ message: "Access denied" });
  }
  res.json({
    isAuthenticated: true,
    admin: req.employee,
  });
}

exports.getEmployeecounts = async (req, res) => {
  try {
    const SingleEmployeeCount = await SingleEmployee.countDocuments();
    const MultipleEmployeeCount = await MultipleEmployee.countDocuments();
    const toolShopCount = await ToolShop.countDocuments();

    const total = SingleEmployeeCount + MultipleEmployeeCount + toolShopCount;

    res.json({
      singleEmployee: SingleEmployeeCount,
      mulipleEmplyee: MultipleEmployeeCount,
      toolshop: toolShopCount,
      totalemp: total
    })
  } catch (err) {
    console.error("Employee count controller error", err.message);
    res.status(500).json({ message: "Sever Error" });
  }
}

exports.Adddomainservice = async (req, res) => {
  try {
    const { domainName, serviceImage } = req.body;
    if (!domainName || !serviceImage) {
      return res.status(400).json({ message: "All the fields are required" });
    }
    const existingDomain = await DomainService.findOne({ domainName });

    if (existingDomain) {
      return res.status(409).json({
        message: "Domain service already exists",
        existing: existingDomain,
      });
    }
    const uploadImage = await cloudinary.uploader.upload(serviceImage, {
      folder: "Domain_service",
      resource_type: "image",
    });
    // Create new domain
    const domain = await DomainService.create({
      domainName,
      serviceImage: uploadImage.secure_url,
    });

    return res.status(201).json({
      message: "Domain service added successfully",
      domain,
    });

  }
  catch (err) {
    console.error("Add domain service controller error", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

exports.setServiceList = async (req, res) => {
  try {
    const {
      DomainServiceId,
      serviceId,
      serviceName,
      serviceCategoryName,
      description,
      price,
      durationInMinutes,
      employeeCount,
      servicecategoryImage
    } = req.body;

    // ================= VALIDATION =================
    if (!DomainServiceId) {
      return res.status(400).json({ message: "DomainServiceId is required" });
    }

    if (
      !serviceCategoryName ||
      !description ||
      !price ||
      !durationInMinutes ||
      !employeeCount
    ) {
      return res.status(400).json({
        message: "Service category fields are required",
      });
    }

    // ================= IMAGE UPLOAD =================
    let imageUrl = null;
    if (servicecategoryImage) {
      const upload = await cloudinary.uploader.upload(
        servicecategoryImage,
        { folder: "service_categories" }
      );
      imageUrl = upload.secure_url;
    }

    // =================================================
    // CASE 1️⃣ : ADD CATEGORY TO EXISTING SERVICE
    // =================================================
    if (serviceId) {
      const service = await ServiceList.findById(serviceId);

      if (!service) {
        return res.status(404).json({
          message: "Service not found",
        });
      }

      // Prevent duplicate category name
      const duplicate = service.serviceCategory.some(
        (cat) =>
          cat.serviceCategoryName.toLowerCase() ===
          serviceCategoryName.toLowerCase()
      );

      if (duplicate) {
        return res.status(400).json({
          message: "Service category already exists",
        });
      }

      service.serviceCategory.push({
        serviceCategoryName,
        description,
        price,
        durationInMinutes,
        employeeCount,
        servicecategoryImage: imageUrl,
      });

      await service.save();

      return res.status(200).json({
        success: true,
        message: "Category added to existing service",
        data: service,
      });
    }

    // =================================================
    // CASE 2️⃣ : CREATE NEW SERVICE + CATEGORY
    // =================================================
    if (!serviceName) {
      return res.status(400).json({
        message: "serviceName is required to create new service",
      });
    }

    const newService = await ServiceList.create({
      DomainServiceId,
      serviceName,
      serviceCategory: [
        {
          serviceCategoryName,
          description,
          price,
          durationInMinutes,
          employeeCount,
          servicecategoryImage: imageUrl,
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "New service created with category",
      data: newService,
    });

  } catch (err) {
    console.error("setServiceList error:", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};


exports.getAllEmployee = async (req, res) => {
  try {
    const singleemployee = await SingleEmployee.find().sort({ createdAt: -1 });
    const multipleEmployee = await MultipleEmployee.find().sort({ createdAt: -1 });
    const toolshop = await ToolShop.find().sort({ createdAt: -1 });

    const employee = [
      ...singleemployee.map(e => ({ ...e.toObject(), employeeType: "single_employee" })),
      ...multipleEmployee.map(e => ({ ...e.toObject(), employeeType: "multiple_employee" })),
      ...toolshop.map(e => ({ ...e.toObject(), employeeType: "tool_shop" }))
    ]
    employee.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, employee });
  }
  catch (err) {
    console.error("Get all employees error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
}

exports.DeleteDomainService = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await DomainService.findById(id);
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }
    if (service.serviceImagePublicId) {
      await cloudinary.uploader.destroy(service.serviceImagePublicId);
    }

    await service.deleteOne();

    res.json({ success: true, message: "Service deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.EditDomainService = async (req, res) => {
  try {
    const { domainserviceId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(domainserviceId)) {
      return res.status(400).json({ message: "Invalid domain service ID" });
    }

    // Pick only allowed fields
    const update = {};
    if (req.body.domainName !== undefined) {
      update.domainName = req.body.domainName;
    }
    if (req.body.serviceImage !== undefined) {
      update.serviceImage = req.body.serviceImage;
    }

    // Update and return new document
    const domainservice = await DomainService.findByIdAndUpdate(
      domainserviceId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!domainservice) {
      return res.status(404).json({ message: "Domain service not found" });
    }

    return res.status(200).json({
      success: true,
      domainservice
    });

  } catch (err) {
    console.error("EditDomainService error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.updateServiceCategory = async (req, res) => {
  const { serviceId, categoryId } = req.params;
  const updates = (({
    serviceCategoryName,
    description,
    price,
    durationInMinutes,
    employeeCount,
    servicecategoryImage,
  }) => ({
    serviceCategoryName,
    description,
    price,
    durationInMinutes,
    employeeCount,
    servicecategoryImage,
  }))(req.body);

  if (!mongoose.Types.ObjectId.isValid(serviceId) || !mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const service = await ServiceList.findById(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

    const category = service.serviceCategory.id(categoryId);
    if (!category) return res.status(404).json({ message: "Category not found" });

    // apply provided fields
    Object.keys(updates).forEach((k) => {
      if (typeof updates[k] !== "undefined") category[k] = updates[k];
    });

    await service.save();

    return res.json({ success: true, category });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteServiceCategory = async (req, res) => {
  const { serviceId, categoryId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(serviceId) || !mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const service = await ServiceList.findById(serviceId);
    if (!service) return res.status(404).json({ message: "Service not found" });

    // Find category
    const category = service.serviceCategory.id(categoryId);
    if (!category) return res.status(404).json({ message: "Category not found" });

    // Remove category properly
    service.serviceCategory.pull({ _id: categoryId });
    await service.save();

    return res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
// exports.getServiceCategories = async (req, res) => {
//   try {
//     const { DomainServiceId } = req.params;

//     const services = await ServiceList.find({ DomainServiceId });

//     if (!services.length) {
//       return res.status(404).json({ message: "No services found" });
//     }

//     const categories = services.flatMap(
//       service => service.serviceCategory
//     );

//     res.status(200).json({
//       success: true,
//       serviceCategory: categories,
//     });
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

exports.getServiceCategories = async (req, res) => {
  const { DomainServiceId } = req.params;

  const services = await ServiceList.find(
    { DomainServiceId },
    {
      serviceName: 1,
      DomainServiceId: 1, // optional
    }
  );

  res.status(200).json({
    services, // _id is ServiceList._id ✅
  });
};
