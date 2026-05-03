const Admin = require('../models/admin.model');
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const DomainService = require("../models/domainservice.model");
const cloudinary = require('../config/cloudinary');
const ServiceList = require('../models/serviceList.model');
const mongoose = require('mongoose');
const Domainparts = require("../models/domainparts.model")
const AppError = require('../utils/AppError');
const Invite = require('../models/Invite.model');
const { MAX_ATTEMPTS, LOCK_TIME } = require('../constant/admin.constant');
const PERMISSIONS = require('../enum/permission.enum');
const ROLES = require('../enum/role.enum');
const Booking = require('../models/Booking.model');
const EmployeeService = require('../models/employeeService.model');
const Commission = require('../models/commissionwallet.model');
const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const PartRequest = require('../models/partsrequest.model');
const PART_REQUEST_STATUS = require('../enum/partsstatus.enum');
const User = require('../models/user.model');
const Review = require('../models/review.model');
const Notification = require('../models/notification.model');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadHandler');
const { findNearbyTeams } = require("../services/booking.service");

exports.inviteAdmin = async (req, res, next) => {
  try {
    const { email, permissions } = req.body;

    if (!email) {
      return next(new AppError("Email is required", 400));
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return next(new AppError("Admin with this email already exists", 400));
    }

    // Validate permissions if provided
    if (permissions && Array.isArray(permissions)) {
      const validPermissions = Object.values(PERMISSIONS);
      const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
      if (invalidPermissions.length > 0) {
        return next(new AppError(`Invalid permissions: ${invalidPermissions.join(', ')}`, 400));
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await Invite.findOneAndUpdate(
      { email },
      {
        email,
        token,
        permission: permissions || [],
        expiresAt,
        used: false,
        attempts: 0
      },
      { upsert: true, new: true }
    );

    // In a real app, you would send this token via email.
    // For now, we return it in the response.
    res.status(200).json({
      message: "Invite generated successfully",
      token,
      email,
      permissions: permissions || []
    });
  } catch (err) {
    next(err);
  }
};

exports.getAllPermissions = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      permissions: PERMISSIONS
    });
  } catch (err) {
    next(err);
  }
};

exports.adminSignup = async (req, res, next) => {
  try {
    const { fullname, email, password, token } = req.body;
    if (!fullname || !email || !password || !token) {
      return next(new AppError("All the fields are required", 400));
    }
    const invite = await Invite.findOne({ email });
    if (!invite) {
      return next(new AppError("Invite not found", 403));
    }
    if (invite.lockedUntil && invite.lockedUntil > Date.now()) {
      return next(new AppError("Too many attempts. Try later", 403));
    }
    if (
      invite.token !== token ||
      invite.used ||
      invite.expiresAt < Date.now()
    ) {
      invite.attempts += 1;

      // Lock after 5 attempts
      if (invite.attempts >= MAX_ATTEMPTS) {
        invite.lockedUntil = Date.now() + LOCK_TIME;
      }

      await invite.save();

      return next(new AppError("Invalid or expired token", 403));
    }

    invite.attempts = 0;
    invite.used = true;

    await invite.save();

    const admin = await Admin.create({
      fullname,
      email,
      password,
      role: ROLES.ADMIN,
      permissions: invite.permission,
      isApproved: true,
    })

    res.status(201).json({ message: "Admin created Successfully" });

  }
  catch (err) {
    next(err);
  }
}
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin.isApproved)
      throw new AppError("Not approved", 403);

    if (admin.lockUntil > Date.now())
      throw new AppError("Account locked", 429);
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
    if (req.role !== ROLES.ADMIN && req.role !== ROLES.SUPER_ADMIN) {
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
    const { domainName } = req.body;
    if (!domainName || !req.file) {
      return next(new AppError("All fields including image are required", 400));
    }
    const existingDomain = await DomainService.findOne({ domainName });

    if (existingDomain) {
      return next(new AppError("Domain service already exists", 400));
    }

    // Upload to Cloudinary manually via helper
    const result = await uploadToCloudinary(req.file, 'Gigiman');

    // Create new domain
    const domain = await DomainService.create({
      domainName,
      serviceImage: result.url,
      serviceImagePublicId: result.publicId,
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
    let {
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
    if (!mongoose.Types.ObjectId.isValid(DomainServiceId)) {
      const domain = await DomainService.findOne({
        domainName: DomainServiceId
      });

      if (!domain) {
        return next(new AppError("Invalid domain", 400));
      }

      DomainServiceId = domain._id;
    }

    // ================= IMAGE UPLOAD =================
    let imageUrl = null;
    if (req.file) {
      imageUrl = req.file.path;
    }

    // =================================================
    // CASE 1 : ADD CATEGORY TO EXISTING SERVICE
    // =================================================
    if (serviceId) {
      const service = await ServiceList.findById(serviceId);

      if (!service) {
        return next(new AppError("Service not found", 404));
      }

      // Upload to Cloudinary via helper
      const result = await uploadToCloudinary(req.file, 'Gigiman');

      service.serviceCategory.push({
        serviceCategoryName,
        description,
        price,
        durationInMinutes,
        employeeCount,
        servicecategoryImage: result ? result.url : null,
        servicecategoryImagePublicId: result ? result.publicId : null,
      });

      await service.save();

      return res.status(200).json({
        success: true,
        message: "Category added to existing service",
        data: service
      });
    }

    // =================================================
    // CASE 2 : CREATE NEW SERVICE
    // =================================================
    if (!serviceName) {
      return next(new AppError("serviceName is required", 400));
    }

    // Upload to Cloudinary via helper
    const result = await uploadToCloudinary(req.file, 'Gigiman');

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
          servicecategoryImage: result ? result.url : null,
          servicecategoryImagePublicId: result ? result.publicId : null,
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: "New service created with category",
      data: newService
    });

  } catch (err) {
    next(err);
  }
};



exports.getAllEmployee = async (req, res, next) => {
  try {
    const singleemployee = await SingleEmployee.find().sort({ createdAt: -1 });
    const multipleEmployee = await MultipleEmployee.find().sort({ createdAt: -1 });
    const toolshop = await ToolShop.find().populate('categories', 'domainpartname').sort({ createdAt: -1 });

    // Get capabilities mapping
    const capabilities = await EmployeeService.find()
      .populate('capableservice', 'domainName')
      .lean();

    const capMap = {};
    capabilities.forEach(c => {
      capMap[c.employeeId] = c.capableservice.map(s => s.domainName);
    });

    const employee = [
      ...singleemployee.map(e => ({
        ...e.toObject(),
        employeeType: "single_employee",
        capabilities: capMap[e._id.toString()] || []
      })),
      ...multipleEmployee.map(e => ({
        ...e.toObject(),
        employeeType: "multiple_employee",
        capabilities: capMap[e._id.toString()] || []
      })),
      ...toolshop.map(e => ({
        ...e.toObject(),
        employeeType: "tool_shop",
        capabilities: e.categories?.map(c => c.domainpartname) || []
      }))
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

    await deleteFromCloudinary(service.serviceImagePublicId);

    await service.deleteOne();

    res.json({ success: true, message: "Service deleted successfully" });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
};

exports.EditDomainService = async (req, res, next) => {
  try {
    const { DomainserviceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(DomainserviceId)) {
      return next(new AppError("Invalid DomainserviceId", 400));
    }

    const domainservice = await DomainService.findById(DomainserviceId);

    if (!domainservice) {
      return next(new AppError("Domain service not found", 404));
    }

    const update = {};

    if (req.body.domainName) {
      update.domainName = req.body.domainName.trim();
    }

    if (req.file) {
      if (domainservice.serviceImagePublicId) {
        await deleteFromCloudinary(domainservice.serviceImagePublicId);
      }

      const result = await uploadToCloudinary(req.file, 'DomainService');

      update.serviceImage = result.url;
      update.serviceImagePublicId = result.publicId;
    }

    const updatedService = await DomainService.findByIdAndUpdate(
      DomainserviceId,
      update,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      domainservice: updatedService
    });

  } catch (err) {
    next(err);
  }
};


exports.updateServiceCategory = async (req, res, next) => {
  try {
    const { serviceId, categoryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serviceId) || !mongoose.Types.ObjectId.isValid(categoryId)) {
      return next(new AppError("Invalid IDs provided", 400));
    }

    const service = await ServiceList.findById(serviceId);

    if (!service) {
      return next(new AppError("Service not found", 404));
    }

    const category = service.serviceCategory.id(categoryId);

    if (!category) {
      return next(new AppError("Category not found", 404));
    }

    if (req.body.serviceCategoryName) {
      category.serviceCategoryName = req.body.serviceCategoryName.trim();
    }

    if (req.body.description) {
      category.description = req.body.description.trim();
    }

    if (req.body.price) {
      category.price = req.body.price;
    }

    if (req.body.durationInMinutes) {
      category.durationInMinutes = req.body.durationInMinutes;
    }

    if (req.body.employeeCount) {
      category.employeeCount = req.body.employeeCount;
    }

    if (req.file) {
      if (category.servicecategoryImagePublicId) {
        await deleteFromCloudinary(category.servicecategoryImagePublicId);
      }

      const result = await uploadToCloudinary(req.file, 'Gigiman');

      category.servicecategoryImage = result.url;
      category.servicecategoryImagePublicId = result.publicId;
    }

    await service.save();

    res.status(200).json({
      success: true,
      category: category
    });

  } catch (err) {
    next(err);
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

    // Delete image from Cloudinary
    await deleteFromCloudinary(category.servicecategoryImagePublicId);
    // Remove category properly
    service.serviceCategory.pull({ _id: categoryId });
    await service.save();

    return res.json({ success: true, message: "Category deleted" });
  } catch (err) {
    console.error(err);
    next(err); //let Global error handler deal with it
  }
};

exports.deleteServiceList = async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return next(new AppError("Invalid serviceId", 400));
    }

    const service = await ServiceList.findById(serviceId);

    if (!service) {
      return next(new AppError("Service not found", 404));
    }

    // Delete images of all categories in this service from Cloudinary
    if (service.serviceCategory && service.serviceCategory.length > 0) {
      for (const category of service.serviceCategory) {
        if (category.servicecategoryImagePublicId) {
          try {
            await deleteFromCloudinary(category.servicecategoryImagePublicId);
          } catch (cloudinaryErr) {
            console.error(`Failed to delete image ${category.servicecategoryImagePublicId} from Cloudinary:`, cloudinaryErr);
            // Continue with other deletions even if one fails
          }
        }
      }
    }

    await ServiceList.findByIdAndDelete(serviceId);

    res.status(200).json({
      success: true,
      message: "Service list and all its categories deleted successfully"
    });
  } catch (err) {
    next(err);
  }
};


exports.getServiceCategories = async (req, res) => {
  const { DomainServiceId } = req.params;

  const services = await ServiceList.find(
    { DomainServiceId },
    {
      serviceName: 1,
      DomainServiceId: 1,
    }
  );

  res.status(200).json({
    services,
  });
};

exports.setDomainTool = async (req, res, next) => {
  try {
    const { domainpartname, domainpartimage, parts } = req.body;

    /* ===============================
       VALIDATION
    =============================== */
    if (!domainpartname || !domainpartimage) {
      return next(new AppError(
        "domainpartname and domainpartimage are required",
        400
      ));
    }

    if (!Array.isArray(parts) || parts.length === 0) {
      return next(new AppError(
        "At least one part is required",
        400
      ));
    }

    for (const part of parts) {
      if (!part.partName || typeof part.price !== "number") {
        return next(new AppError(
          "Each part must have partName and numeric price",
          400
        ));
      }
    }

    /* ===============================
       DUPLICATE CHECK (CASE SAFE)
    =============================== */
    const existing = await Domainparts.findOne({
      domainpartname: new RegExp(`^${domainpartname}$`, "i")
    });

    if (existing) {
      return next(new AppError(
        "Domain part already exists",
        409
      ));
    }

    /* ===============================
       IMAGE UPLOAD
    =============================== */
    if (!req.file) {
      return next(new AppError("Domain part image is required", 400));
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'Gigiman'
    });

    const imageUrl = result.secure_url;
    const publicId = result.public_id;

    /* ===============================
       CREATE DOCUMENT
    =============================== */
    const domainPart = await Domainparts.create({
      domainpartname: domainpartname.trim(),
      domainpartimage: imageUrl,
      domainpartimagePublicId: publicId,
      parts
    });

    return res.status(201).json({
      success: true,
      message: "Domain part added successfully",
      domainPart
    });

  } catch (err) {
    console.error("setDomainTool error:", err.message);
    next(err);
  }
};



exports.editDomainToolById = async (req, res, next) => {
  try {
    const { domainpartId } = req.params;
    const { domainpartname, domainpartimage, parts } = req.body;

    if (!mongoose.Types.ObjectId.isValid(domainpartId)) {
      return next(new AppError("Invalid domain part ID", 400));
    }

    const domainPart = await Domainparts.findById(domainpartId);
    if (!domainPart) {
      return next(new AppError("Domain part not found", 404));
    }

    /* ===============================
       NAME UPDATE (CASE SAFE)
    =============================== */
    if (domainpartname) {
      const exists = await Domainparts.findOne({
        _id: { $ne: domainpartId },
        domainpartname: new RegExp(`^${domainpartname}$`, "i")
      });

      if (exists) {
        return next(new AppError(
          "Another domain part already uses this name",
          409
        ));
      }

      domainPart.domainpartname = domainpartname.trim();
    }

    /* ===============================
       IMAGE UPDATE (CLOUD SAFE)
    =============================== */
    if (req.file) {
      // Delete old image
      await deleteFromCloudinary(domainPart.domainpartimagePublicId);

      // Upload new to Cloudinary via helper
      const result = await uploadToCloudinary(req.file, 'Gigiman');

      domainPart.domainpartimage = result.url;
      domainPart.domainpartimagePublicId = result.publicId;
    }

    /* ===============================
       PARTS UPDATE (OPTIONAL)
    =============================== */
    if (Array.isArray(parts)) {
      // Build a lookup set of existing part names
      const existingPartNames = new Set(
        domainPart.parts.map(p => p.partName.toLowerCase())
      );

      for (const part of parts) {
        if (!part.partName || typeof part.price !== "number") {
          return next(new AppError(
            "Each part must have partName and numeric price",
            400
          ));
        }

        const partKey = part.partName.toLowerCase();

        // Skip duplicates
        if (existingPartNames.has(partKey)) {
          continue;
        }

        // Add only new parts
        domainPart.parts.push({
          partName: part.partName.trim(),
          price: part.price
        });

        existingPartNames.add(partKey);
      }
    }

    await domainPart.save();

    return res.status(200).json({
      success: true,
      message: "Domain part updated successfully",
      domainPart
    });

  } catch (err) {
    console.error("editDomainToolById error:", err.message);
    next(err);
  }
};

exports.deleteDomainpartById = async (req, res, next) => {
  try {
    const { domainpartId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(domainpartId)) {
      return next(new AppError("Invalid domain part ID", 400));
    }

    const domainPart = await Domainparts.findById(domainpartId);
    if (!domainPart) {
      return next(new AppError("Domain part not found", 404));
    }

    // Delete Cloudinary image
    await deleteFromCloudinary(domainPart.domainpartimagePublicId);

    // Delete DB record
    await domainPart.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Domain part deleted successfully"
    });

  } catch (err) {
    console.error("deleteDomainpartById error:", err.message);
    next(err);
  }
};

exports.getAllBooking = async (req, res, next) => {
  try {
    const booking = await Booking.find().select("-addressTitle");
    if (!booking || !booking.lenght === 0) {
      return next(new AppError("No booking Now", 400));
    }
    return res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
}

const { sendNotification } = require("../utils/notification.util");

exports.blockServicer = async (req, res, next) => {
  try {
    const io = req.app.get("io");

    const { id } = req.params;
    const { servicerType, blockedUntil } = req.body;

    let blockDate = null;
    if (blockedUntil) {
      blockDate = new Date(blockedUntil);
      if (isNaN(blockDate.getTime())) {
        return next(new AppError("Invalid date format for blockedUntil", 400));
      }
    }

    let model;
    if (servicerType === ROLES.SINGLE_EMPLOYEE) model = SingleEmployee;
    else if (servicerType === ROLES.MULTIPLE_EMPLOYEE) model = MultipleEmployee;
    else if (servicerType === ROLES.TOOL_SHOP) model = ToolShop;
    else {
      // If type not provided, try to find in all three
      const [single, multiple, tool] = await Promise.all([
        SingleEmployee.findById(id),
        MultipleEmployee.findById(id),
        ToolShop.findById(id)
      ]);

      const servicer = single || multiple || tool;
      if (!servicer) return next(new AppError("Servicer not found", 404));

      servicer.isBlocked = true;
      servicer.isActive = false;
      if (blockDate) servicer.blockedUntil = blockDate;
      if (servicer.availabilityStatus) servicer.availabilityStatus = "AVAILABLE";
      if (servicer.teamStatus) servicer.teamStatus = "AVAILABLE";
      await servicer.save();

      // Notify Servicer and Admin
      await sendNotification({
        empId: servicer._id,
        empModel: single ? "SingleEmployee" : (multiple ? "MultipleEmployee" : "ToolShop"),
        title: "Account Blocked",
        message: `Your account has been blocked by the administrator${blockDate ? ` until ${blockDate.toDateString()}` : ""}. Please contact support for more details.`,
        type: "BLOCK",
        targetRole: "ADMIN",
        io
      });

      return res.json({ success: true, message: "Servicer blocked successfully" });

    }

    const updatePayload = {
      isBlocked: true,
      isActive: false
    };
    if (blockDate) updatePayload.blockedUntil = blockDate;

    const servicer = await model.findByIdAndUpdate(id, updatePayload, { new: true });
    if (!servicer) return next(new AppError("Servicer not found", 404));

    // Also handle non-atomic update for status fields if needed
    if (servicer.availabilityStatus) {
      servicer.availabilityStatus = "AVAILABLE";
      await servicer.save();
    }
    if (servicer.teamStatus) {
      servicer.teamStatus = "AVAILABLE";
      await servicer.save();
    }

    // Notify Servicer and Admin
    await sendNotification({
      empId: servicer._id,
      empModel: servicerType,
      title: "Account Blocked",
      message: `Your account has been blocked by the administrator${blockDate ? ` until ${blockDate.toDateString()}` : ""}. Please contact support for more details.`,
      type: "BLOCK",
      targetRole: "ADMIN",
      io
    });

    res.json({ success: true, message: "Servicer blocked successfully" });


  } catch (err) {
    next(err);
  }
};

exports.unblockServicer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { servicerType } = req.body;

    let model;
    if (servicerType === ROLES.SINGLE_EMPLOYEE) model = SingleEmployee;
    else if (servicerType === ROLES.MULTIPLE_EMPLOYEE) model = MultipleEmployee;
    else if (servicerType === ROLES.TOOL_SHOP) model = ToolShop;
    else {
      const [single, multiple, tool] = await Promise.all([
        SingleEmployee.findById(id),
        MultipleEmployee.findById(id),
        ToolShop.findById(id)
      ]);

      const servicer = single || multiple || tool;
      if (!servicer) return next(new AppError("Servicer not found", 404));

      servicer.isBlocked = false;
      servicer.blockedUntil = null; // Clear date-based block too
      await servicer.save();

      // Notify Servicer and Admin
      await sendNotification({
        empId: servicer._id,
        empModel: single ? "SingleEmployee" : (multiple ? "MultipleEmployee" : "ToolShop"),
        title: "Account Unblocked",
        message: "Your account has been unblocked by the administrator. You can now resume your services.",
        type: "SYSTEM",
        targetRole: "ADMIN",
        io: req.app.get("io")
      });

      return res.json({ success: true, message: "Servicer unblocked successfully" });

    }

    const servicer = await model.findByIdAndUpdate(id, { isBlocked: false, blockedUntil: null }, { new: true });

    if (servicer) {
      // Notify Servicer and Admin
      await sendNotification({
        empId: servicer._id,
        empModel: servicerType,
        title: "Account Unblocked",
        message: "Your account has been unblocked by the administrator. You can now resume your services.",
        type: "SYSTEM",
        targetRole: "ADMIN",
        io: req.app.get("io")
      });
    }



    if (!servicer) return next(new AppError("Servicer not found", 404));

    res.json({ success: true, message: "Servicer unblocked successfully" });
  } catch (err) {
    next(err);
  }
};

exports.getAdminDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();

    // Helper for date ranges
    const getStartOf = (unit, count) => {
      const d = new Date(now);
      if (unit === 'day') d.setDate(d.getDate() - count);
      if (unit === 'week') d.setDate(d.getDate() - (count * 7));
      if (unit === 'month') d.setMonth(d.getMonth() - count);
      if (unit === 'year') d.setFullYear(d.getFullYear() - count);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // 1. Basic Counts
    const [singleCount, multiCount, shopCount, bookingCount, userCount] = await Promise.all([
      SingleEmployee.countDocuments(),
      MultipleEmployee.countDocuments(),
      ToolShop.countDocuments(),
      Booking.countDocuments(),
      User.countDocuments()
    ]);

    // 2. Revenue Totals
    const [serviceRevenueStats, partRevenueStats, commissionStats] = await Promise.all([
      Booking.aggregate([
        { $match: { status: BOOKING_STATUS.COMPLETED } },
        { $group: { _id: null, total: { $sum: "$totalServicePrice" } } }
      ]),
      PartRequest.aggregate([
        { $match: { status: PART_REQUEST_STATUS.COLLECTED } },
        { $group: { _id: null, total: { $sum: "$totalCost" } } }
      ]),
      Commission.aggregate([
        { $group: { _id: null, total: { $sum: "$commissionAmount" } } }
      ])
    ]);

    const totalServiceRevenue = serviceRevenueStats.length > 0 ? serviceRevenueStats[0].total : 0;
    const totalPartRevenue = partRevenueStats.length > 0 ? partRevenueStats[0].total : 0;
    const totalCommissionPrice = commissionStats.length > 0 ? commissionStats[0].total : 0;
    const grandTotalRevenue = totalServiceRevenue + totalPartRevenue;

    // 3. Trends Aggregation Helper
    const getTrends = async (startDate, groupFormat) => {
      const [service, parts, commissions] = await Promise.all([
        Booking.aggregate([
          { $match: { status: BOOKING_STATUS.COMPLETED, createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: groupFormat,
              serviceRevenue: { $sum: "$totalServicePrice" }
            }
          },
          { $sort: { "_id": 1 } }
        ]),
        PartRequest.aggregate([
          { $match: { status: PART_REQUEST_STATUS.COLLECTED, createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: groupFormat,
              partRevenue: { $sum: "$totalCost" }
            }
          },
          { $sort: { "_id": 1 } }
        ]),
        Commission.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: groupFormat,
              commissionRevenue: { $sum: "$commissionAmount" }
            }
          },
          { $sort: { "_id": 1 } }
        ])
      ]);
      return { service, parts, commissions };
    };


    // Define Timeframes
    const dayStart = getStartOf('day', 7);
    const weekStart = getStartOf('week', 8);
    const monthStart = getStartOf('month', 6);
    const yearStart = getStartOf('year', 5);

    // Run Aggregations
    const [dailyData, weeklyData, monthlyData, yearlyData] = await Promise.all([
      getTrends(dayStart, { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }),
      getTrends(weekStart, { $concat: [{ $toString: { $year: "$createdAt" } }, "-W", { $toString: { $week: "$createdAt" } }] }),
      getTrends(monthStart, { $dateToString: { format: "%Y-%m", date: "$createdAt" } }),
      getTrends(yearStart, { $dateToString: { format: "%Y", date: "$createdAt" } })
    ]);

    // Format Trends Helper
    const formatTrends = (data, timeframe, count) => {
      const merged = {};

      // Initialize empty slots
      for (let i = 0; i < count; i++) {
        const d = new Date(now);
        let key, label;

        if (timeframe === 'day') {
          d.setDate(d.getDate() - i);
          key = d.toISOString().split('T')[0];
          label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        } else if (timeframe === 'week') {
          d.setDate(d.getDate() - (i * 7));
          // Simplified week key (not ISO but consistent with aggregate)
          const weekNum = Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
          key = `${d.getFullYear()}-W${weekNum}`;
          label = `Week ${weekNum}`;
        } else if (timeframe === 'month') {
          d.setMonth(d.getMonth() - i);
          key = d.toISOString().slice(0, 7);
          label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } else if (timeframe === 'year') {
          d.setFullYear(d.getFullYear() - i);
          key = d.getFullYear().toString();
          label = key;
        }

        merged[key] = { label, serviceRevenue: 0, partRevenue: 0, commissionRevenue: 0, totalRevenue: 0 };
      }

      data.service.forEach(item => { if (merged[item._id]) { merged[item._id].serviceRevenue = item.serviceRevenue; merged[item._id].totalRevenue += item.serviceRevenue; } });
      data.parts.forEach(item => { if (merged[item._id]) { merged[item._id].partRevenue = item.partRevenue; merged[item._id].totalRevenue += item.partRevenue; } });
      data.commissions.forEach(item => { if (merged[item._id]) { merged[item._id].commissionRevenue = item.commissionRevenue; } });

      return Object.values(merged).reverse();
    };

    // 4. Booking Status Distribution
    const statusDistribution = await Booking.aggregate([
      { $group: { _id: "$status", count: { $count: {} } } }
    ]);

    res.json({
      success: true,
      counts: {
        singleEmployee: singleCount,
        multipleEmployee: multiCount,
        toolShop: shopCount,
        totalBookings: bookingCount,
        totalemp: singleCount + multiCount + shopCount,
        userCount: userCount
      },
      revenueOverview: {
        totalServiceRevenue,
        totalPartRevenue,
        totalCommission: totalCommissionPrice,
        totalCommissionPrice,
        grandTotalRevenue
      },
      trends: {
        daily: formatTrends(dailyData, 'day', 7),
        weekly: formatTrends(weeklyData, 'week', 8),
        monthly: formatTrends(monthlyData, 'month', 6),
        yearly: formatTrends(yearlyData, 'year', 5)
      },
      // Backward compatibility for existing frontend
      monthlyTrends: formatTrends(monthlyData, 'month', 6),
      statusDistribution
    });
  } catch (err) {
    next(err);
  }
};

exports.exportDashboardData = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ status: BOOKING_STATUS.COMPLETED })
      .populate('user', 'fullname')
      .populate('primaryEmployee', 'fullname empId')
      .select('createdAt totalServicePrice totalPrice serviceCategoryName status');

    const parts = await PartRequest.find({ status: PART_REQUEST_STATUS.COLLECTED })
      .populate('employeeId', 'fullname')
      .populate('shopId', 'shopName')
      .select('createdAt totalCost status');

    // Simple CSV creation
    let csv = "Type,Date,Reference,Description,Revenue\n";

    bookings.forEach(b => {
      csv += `Service,${b.createdAt.toISOString().split('T')[0]},${b._id},${b.serviceCategoryName},${b.totalServicePrice}\n`;
    });

    parts.forEach(p => {
      csv += `Part,${p.createdAt.toISOString().split('T')[0]},${p._id},Part Purchase,${p.totalCost}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=gigiman_financial_report.csv');
    res.status(200).send(csv);

  } catch (err) {
    next(err);
  }
};

exports.getLiveBookings = async (req, res, next) => {

  try {
    const liveStatuses = [
      BOOKING_STATUS.PENDING,
      BOOKING_STATUS.ACCEPTED,
      BOOKING_STATUS.ASSIGNED,
      BOOKING_STATUS.IN_PROGRESS
    ];

    const liveBookings = await Booking.find({ status: { $in: liveStatuses } })
      .populate('user', 'fullName phoneNo')
      .populate('primaryEmployee', 'fullname phoneNo')
      .populate('servicerCompany', 'storeName ownerName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: liveBookings.length,
      bookings: liveBookings
    });
  } catch (err) {
    next(err);
  }
};

exports.getEmployeeCapabilities = async (req, res, next) => {
  try {
    // Get all employee services and join with domain names
    const capabilities = await EmployeeService.find()
      .populate('capableservice', 'domainName')
      .lean();

    // Map SingleEmployee and MultipleEmployee details
    const [singles, multiples] = await Promise.all([
      SingleEmployee.find({}, 'empId fullname phoneNo role isActive isBlocked').lean(),
      MultipleEmployee.find({}, 'TeamId storeName ownerName phoneNo role isActive isBlocked').lean()
    ]);

    // Create a lookup for capabilities
    const capMap = {};
    capabilities.forEach(c => {
      // capabilities schema has employeeId as String (maybe empId or _id?)
      // EmployeeService model has employeeId: String.
      // Based on Booking model, primaryEmployee is ObjectId.
      // Let's assume it matches the String form of _id.
      capMap[c.employeeId] = c.capableservice.map(s => s.domainName);
    });

    const employees = [
      ...singles.map(s => ({ ...s, capabilities: capMap[s._id.toString()] || [] })),
      ...multiples.map(m => ({ ...m, capabilities: capMap[m._id.toString()] || [] }))
    ];

    res.json({
      success: true,
      count: employees.length,
      employees
    });
  } catch (err) {
    next(err);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      user: users
    });
  } catch (err) {
    next(err);
  }
};

exports.getAdminUserHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const bookings = await Booking.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('primaryEmployee', 'fullname email phoneNo')
      .populate('servicerCompany', 'storeName ownerName')
      .populate('selectedToolShop', 'shopName toolShopId');

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (err) {
    next(err);
  }
};

exports.getAdminBookingReview = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const review = await Review.findOne({ booking: bookingId })
      .populate('user', 'fullName')
      .populate('primaryEmployee', 'fullname');

    res.json({
      success: true,
      review: review || null
    });
  } catch (err) {
    next(err);
  }
};

/* ======================================================
   ADMIN MANUAL ASSIGNMENT TOOLS
====================================================== */

/**
 * Get bookings where auto-assignment failed (No Provider)
 */
exports.getFailedBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      $or: [
        { status: BOOKING_STATUS.NO_PROVIDER },
        {
          assignmentStatus: "FAILED",
        }
      ]
    })
      .populate('user', 'fullName phoneNo')
      .populate('domainService', 'domainName')
      .sort({ createdAt: -1 })
      .lean();

    // Map the status for the frontend so it explicitly shows 'failed' or 'no_provider'
    const formattedBookings = bookings.map(booking => ({
      ...booking,
      status: booking.status === BOOKING_STATUS.NO_PROVIDER ? 'no_provider' : 'failed'
    }));

    res.json({
      success: true,
      count: formattedBookings.length,
      bookings: formattedBookings
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Find nearby servicers for a specific failed booking
 */
exports.getNearbyServicersForBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);
    if (!booking) return next(new AppError("Booking not found", 404));

    const result = await findNearbyTeams({
      serviceCategoryName: booking.serviceCategoryName,
      coordinates: booking.location.coordinates,
      serviceCount: booking.employeeCount || 1, // Fix using employeeCount
      adminOverride: true // Flag to allow searching inactive employees
    });

    res.json({
      success: true,
      result
    });
  } catch (err) {
    next(err);
  }
};


exports.adminManualNotifyServicer = async (req, res, next) => {
  try {
    const { bookingId, servicerId, servicerType } = req.body;
    const io = req.app.get("io");

    // 1. Validate IDs
    if (!mongoose.Types.ObjectId.isValid(bookingId) || !mongoose.Types.ObjectId.isValid(servicerId)) {
      return next(new AppError("Invalid booking or servicer ID", 400));
    }

    // 2. Fetch Booking and populate user
    const booking = await Booking.findById(bookingId).populate("user", "fullName socketId");
    if (!booking) return next(new AppError("Booking not found", 404));

    // 3. Resolve servicer type and fetch servicer
    let servicer;
    const isSingle = servicerType === "single" || servicerType === ROLES.SINGLE_EMPLOYEE;

    if (isSingle) {
      servicer = await SingleEmployee.findById(servicerId);
    } else {
      servicer = await MultipleEmployee.findById(servicerId);
    }

    if (!servicer) {
      return next(new AppError("Servicer not found", 404));
    }

    // 4. Enhanced Security and Status Checks
    if (!servicer.isActive) {
      return next(new AppError("Servicer is not active", 400));
    }

    if (servicer.isBlocked || (servicer.blockedUntil && servicer.blockedUntil > new Date())) {
      return next(new AppError("Servicer is currently blocked", 400));
    }

    // --- Commission Owed Check ---
    const unpaidData = await Commission.aggregate([
      { $match: { empId: new mongoose.Types.ObjectId(servicerId), status: { $ne: 'PAID' } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const totalUnpaid = unpaidData[0]?.total || 0;
    if (totalUnpaid >= 1000) {
      return next(new AppError("Servicer is blocked due to outstanding commission >= 1000", 400));
    }

    // Check availability
    const statusField = isSingle ? "availabilityStatus" : "teamStatus";
    if (servicer[statusField] !== "AVAILABLE") {
      return next(new AppError(`Servicer is currently ${servicer[statusField]}`, 400));
    }

    // 5. Verify Capability (Security: ensures servicer is qualified for this domain)
    const capability = await EmployeeService.findOne({
      employeeId: servicerId,
      capableservice: booking.domainService
    });

    if (!capability) {
      return next(new AppError("Servicer is not qualified for this service", 400));
    }

    // 6. Set status to OFFERED to prevent conflict with other assignments
    if (isSingle) {
      await SingleEmployee.findByIdAndUpdate(servicerId, {
        availabilityStatus: "OFFERED",
        offerBookingId: bookingId
      });
      // Optionally update booking assignment state
      await Booking.findByIdAndUpdate(bookingId, {
        assignmentStatus: "OFFERED",
        offeredEmployee: servicerId
      });
    } else {
      await MultipleEmployee.findByIdAndUpdate(servicerId, {
        teamStatus: "OFFERED",
        offerBookingId: bookingId
      });
      await Booking.findByIdAndUpdate(bookingId, {
        assignmentStatus: "OFFERED"
      });
    }

    // Prepare payload for provider notification
    const payload = {
      bookingId: booking._id,
      service: booking.serviceCategoryName,
      totalPrice: booking.totalPrice,
      address: booking.address,
      user: { name: booking.user?.fullName },
      coordinates: booking.location.coordinates, // Lat/Lng back to front
      employeeCount: booking.employeeCount,
      isAdminManual: true,
    };

    if (isSingle) {
      io.to(`employee_${servicerId}`).emit("new-booking-request", payload);
    } else {
      io.to(`team_${servicerId}`).emit("team-booking-request", payload);
    }

    // Save persistent notification for the servicer
    const [lng1, lat1] = booking.location.coordinates;
    const [lng2, lat2] = servicer.location.coordinates;

    // Simple Haversine distance calculation
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = (R * c).toFixed(1);

    const mapsLink = `https://www.google.com/maps?q=${lat1},${lng1}`;
    const servicerName = servicer.fullname || servicer.storeName || "Servicer";

    await Notification.create({
      empId: servicerId,
      empModel: isSingle ? "SingleEmployee" : "MultipleEmployee",
      title: "New Booking Request (Manual Assign)",
      message: `Hello ${servicerName}, Admin has assigned you a ${booking.serviceCategoryName} booking request. Distance: ~${distanceKm} km. Location: ${mapsLink}`,
      type: "BOOKING",
      data: { bookingId: booking._id }
    });

    // 8. Notify the Customer (User)
    if (booking.user) {
      // Real-time notification if user is online
      if (booking.user.socketId) {
        io.to(booking.user.socketId).emit("booking-status-update", {
          bookingId: booking._id,
          status: "OFFERED",
          message: `Admin has assigned ${servicerName} to your booking. Waiting for their confirmation.`
        });
      }

      // Persistent notification for user history
      await Notification.create({
        userId: booking.user._id,
        title: "Servicer Assigned",
        message: `Admin has manually assigned ${servicerName} to your booking #${booking._id}. They are currently reviewing the request.`,
        type: "BOOKING",
        data: { bookingId: booking._id }
      });
    }

    res.json({
      success: true,
      message: `Notification sent to ${servicerName}`,
      coordinates: booking.location.coordinates,
      distance: distanceKm,
      service: booking.serviceCategoryName
    });
  } catch (err) {
    next(err);
  }
};


exports.getAllCommissionsAdmin = async (req, res, next) => {
  try {
    const { status, empId } = req.query;
    let filter = {};
    if (status) filter.status = status;
    if (empId) filter.empId = empId;

    const commissions = await Commission.find(filter)
      .populate('serviceId', 'serviceName')
      .populate('empId', 'fullname storeName phoneNo')
      .sort({ createdAt: -1 });

    // Aggregated summary per employee
    const summary = await Commission.aggregate([
      {
        $group: {
          _id: "$empId",
          empModel: { $first: "$empModel" },
          totalCommission: { $sum: "$commissionAmount" },
          totalPaid: { $sum: { $ifNull: ["$paidAmount", 0] } },
          totalPending: {
            $sum: {
              $subtract: [
                "$commissionAmount",
                { $ifNull: ["$paidAmount", 0] }
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: "singleemployees",
          localField: "_id",
          foreignField: "_id",
          as: "singleEmp"
        }
      },
      {
        $lookup: {
          from: "multipleemployees",
          localField: "_id",
          foreignField: "_id",
          as: "multiEmp"
        }
      },
      {
        $lookup: {
          from: "toolshops",
          localField: "_id",
          foreignField: "_id",
          as: "toolShop"
        }
      },
      {
        $project: {
          _id: 1,
          totalCommission: 1,
          totalPaid: 1,
          totalPending: 1,
          employee: {
            $switch: {
              branches: [
                { case: { $gt: [{ $size: "$singleEmp" }, 0] }, then: { $arrayElemAt: ["$singleEmp", 0] } },
                { case: { $gt: [{ $size: "$multiEmp" }, 0] }, then: { $arrayElemAt: ["$multiEmp", 0] } },
                { case: { $gt: [{ $size: "$toolShop" }, 0] }, then: { $arrayElemAt: ["$toolShop", 0] } }
              ],
              default: null
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          totalCommission: 1,
          totalPaid: 1,
          totalPending: 1,
          name: { $ifNull: ["$employee.fullname", "$employee.storeName", "$employee.shopName"] },
          phoneNo: "$employee.phoneNo",
          type: "$employee.role"
        }
      },
      { $sort: { totalPending: -1 } }
    ]);

    res.json({ success: true, commissions, summary });
  } catch (err) {
    next(err);
  }
};


exports.adminAddCommission = async (req, res, next) => {
  try {
    const { empId, amount } = req.body;

    if (!empId || !amount) {
      return next(new AppError("empId and amount are required", 400));
    }

    let servicer = await SingleEmployee.findById(empId);
    let empModel = "SingleEmployee";
    let empType = ROLES.SINGLE_EMPLOYEE;

    if (!servicer) {
      servicer = await MultipleEmployee.findById(empId);
      empModel = "MultipleEmployee";
      empType = ROLES.MULTIPLE_EMPLOYEE;
    }

    if (!servicer) {
      return next(new AppError("Servicer not found", 404));
    }


    const empService = await EmployeeService.findOne({ employeeId: empId }).populate("capableservice");
    if (!empService || !empService.capableservice || empService.capableservice.length === 0) {
      return next(new AppError("Servicer does not have an assigned service domain to associate with commission charge", 400));
    }

    const newCommission = await Commission.create({
      empId,
      empType,
      empModel,
      serviceId: empService.capableservice[0]._id, // using first capable domain service as proxy
      totalAmount: 0,
      commissionAmount: amount, // The manual penalty / commission
      status: 'PENDING'
    });

    const unpaidData = await Commission.aggregate([
      { $match: { empId: new mongoose.Types.ObjectId(empId), status: { $ne: 'PAID' } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);

    const totalUnpaid = unpaidData[0]?.total || 0;

    // Automatically block the servicer if >= 1000
    if (totalUnpaid >= 1000) {
      if (empType === ROLES.SINGLE_EMPLOYEE) {
        await SingleEmployee.findByIdAndUpdate(empId, { isBlocked: true, isActive: false });
      } else if (empType === ROLES.MULTIPLE_EMPLOYEE) {
        await MultipleEmployee.findByIdAndUpdate(empId, { isBlocked: true, isActive: false });
      }
    }

    res.json({
      success: true,
      message: "Commission added successfully",
      newCommission,
      totalUnpaid,
      isBlocked: totalUnpaid >= 1000
    });

  } catch (err) {
    next(err);
  }
};
