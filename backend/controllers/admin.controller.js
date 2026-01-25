const Admin = require('../models/admin.model');
const jwt = require("jsonwebtoken");
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const DomainService = require("../models/domainservice.model");
const cloudinary = require('../config/cloudinary');
const ServiceList = require('../models/serviceList.model');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return next(new AppError("Admin not found", 400));
    }
    const match = await admin.comparePassword(password);
    if (!match) {
      return next(new AppError("Invalid password", 400));
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
    next(err); //let Global error handler deal with it
  }
}

exports.checkAuth = async (req, res, next) => {
  try {
    if (req.role != 'admin') {
      return res.status(403).json({ message: "Access denied" });
    }
    res.json({
      isAuthenticated: true,
      admin: req.employee,
    });

  } catch (err) {
    next(err); //let Global error handler deal with it
  }
}

exports.getEmployeecounts = async (req, res, next) => {
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
    next(err); //let Global error handler deal with it
  }
}

exports.Adddomainservice = async (req, res, next) => {
  try {
    const { domainName, serviceImage } = req.body;
    if (!domainName || !serviceImage) {
      return next(new AppError("All the fields are required", 400));
    }
    const existingDomain = await DomainService.findOne({ domainName });

    if (existingDomain) {
      return next(new AppError("Domain service already exists", 400));
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
    next(err); //let Global error handler deal with it
  }
}

exports.setServiceList = async (req, res, next) => {
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
      return next(new AppError("DomainServiceId is required", 400));
    }

    if (
      !serviceCategoryName ||
      !description ||
      !price ||
      !durationInMinutes ||
      !employeeCount
    ) {
      return next(new AppError("All category fields are required", 400));
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
    // CASE 1 : ADD CATEGORY TO EXISTING SERVICE
    // =================================================
    if (serviceId) {
      const service = await ServiceList.findById(serviceId);

      if (!service) {
        return next(new AppError("Service not found", 404));
      }

      // Prevent duplicate category name
      const duplicate = service.serviceCategory.some(
        (cat) =>
          cat.serviceCategoryName.toLowerCase() ===
          serviceCategoryName.toLowerCase()
      );

      if (duplicate) {
        return next(new AppError("Category name already exists in this service", 400));
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
    // CASE 2 : CREATE NEW SERVICE + CATEGORY
    // =================================================
    if (!serviceName) {
      return next(new AppError("serviceName is required to create new service", 400));
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
    next(err); //let Global error handler deal with it
  }
};


exports.getAllEmployee = async (req, res, next) => {
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
    next(err); //let Global error handler deal with it
  }
}

exports.DeleteDomainService = async (req, res, next) => {
  try {
    const { id } = req.params;

    const service = await DomainService.findById(id);
    if (!service) {
      return next(new AppError("Domain service not found", 404));
    }
    if (service.serviceImagePublicId) {
      await cloudinary.uploader.destroy(service.serviceImagePublicId);
    }

    await service.deleteOne();

    res.json({ success: true, message: "Service deleted successfully" });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.EditDomainService = async (req, res, next) => {
  try {
    const { DomainserviceId } = req.params;
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(DomainserviceId)) {
      return next(new AppError("Invalid DomainserviceId", 400));
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
      DomainserviceId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!domainservice) {
      return next(new AppError("Domain service not found", 404));
    }

    return res.status(200).json({
      success: true,
      domainservice
    });

  } catch (err) {
    next(err);
  }
};


exports.updateServiceCategory = async (req, res, next) => {
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
    return next(new AppError("Invalid id", 400));
  }

  try {
    const service = await ServiceList.findById(serviceId);
    if (!service) return next(new AppError("Service not found", 404));

    const category = service.serviceCategory.id(categoryId);
    if (!category) return next(new AppError("Category not found", 404));

    // apply provided fields
    Object.keys(updates).forEach((k) => {
      if (typeof updates[k] !== "undefined") category[k] = updates[k];
    });

    await service.save();

    return res.json({ success: true, category });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.deleteServiceCategory = async (req, res, next) => {
  const { serviceId, categoryId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(serviceId) || !mongoose.Types.ObjectId.isValid(categoryId)) {
    return next(new AppError("Invalid id", 400));
  }

  try {
    const service = await ServiceList.findById(serviceId);
    if (!service) return next(new AppError("Service not found", 404));

    // Find category
    const category = service.serviceCategory.id(categoryId);
    if (!category) return next(new AppError("Category not found", 404));
    // Remove category properly
    service.serviceCategory.pull({ _id: categoryId });
    await service.save();

    return res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    console.error(err);
    next(err); //let Global error handler deal with it
  }
};