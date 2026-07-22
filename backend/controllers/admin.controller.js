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
const RegionModel = require('../models/region.model');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadHandler');
const { findNearbyTeams } = require("../services/booking.service");

const normalizeRegionName = (name) => {
  if (!name) return "";
  const clean = name.toLowerCase().trim();
  // Use .includes() so any variant is caught
  if (clean.includes("trichy") || clean.includes("tiruchy") ||
      clean.includes("tiruchirappalli") || clean.includes("tiruchirapalli")) {
    return "trichy";
  }
  if (clean.includes("thanjavur") || clean.includes("tanjore")) return "thanjavur";
  if (clean.includes("coimbatore") || clean.includes("kovai"))  return "coimbatore";
  if (clean.includes("chennai")    || clean.includes("madras")) return "chennai";
  if (clean.includes("madurai"))    return "madurai";
  return clean;
};

exports.inviteAdmin = async (req, res, next) => {
  try {
    const { email, permissions, fullname, allowedRegions } = req.body;

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
        fullname,
        token,
        permission: permissions || [],
        allowedRegions: allowedRegions || [],
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
      fullname,
      permissions: permissions || [],
      allowedRegions: allowedRegions || []
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

exports.getInviteDetails = async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) {
      return next(new AppError("Token is required", 400));
    }
    const invite = await Invite.findOne({ token });
    if (!invite) {
      return next(new AppError("Invite not found", 404));
    }
    if (invite.used) {
      return next(new AppError("Invite has already been used", 400));
    }
    if (invite.expiresAt < Date.now()) {
      return next(new AppError("Invite has expired", 400));
    }
    res.status(200).json({
      success: true,
      invite: {
        email: invite.email,
        fullname: invite.fullname,
        permission: invite.permission,
        role: invite.role
      }
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

    // Look up the invite by token (random string) rather than email
    const invite = await Invite.findOne({ token });
    if (!invite) {
      return next(new AppError("Invite not found", 403));
    }
    if (invite.lockedUntil && invite.lockedUntil > Date.now()) {
      return next(new AppError("Too many attempts. Try later", 403));
    }

    // Verify the email matches the invite email
    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      invite.attempts += 1;
      if (invite.attempts >= MAX_ATTEMPTS) {
        invite.lockedUntil = Date.now() + LOCK_TIME;
      }
      await invite.save();
      return next(new AppError("Email mismatch for this invite token", 403));
    }

    // Verify invite token usage/expiration
    if (
      invite.used ||
      invite.expiresAt < Date.now()
    ) {
      invite.attempts += 1;

      // Lock after 5 attempts
      if (invite.attempts >= MAX_ATTEMPTS) {
        invite.lockedUntil = Date.now() + LOCK_TIME;
      }

      await invite.save();

      return next(new AppError("Invite token is already used or expired", 403));
    }

    // Strong password validation check
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return next(new AppError("Password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, one number, and one special character", 400));
    }

    invite.attempts = 0;
    invite.used = true;

    await invite.save();

    const admin = await Admin.create({
      fullname: fullname || invite.fullname || "Admin",
      email: email.toLowerCase(),
      password,
      role: invite.role || ROLES.ADMIN,
      permissions: invite.permission,
      allowedRegions: invite.allowedRegions || [],
      isApproved: true,
    });

    res.status(201).json({ message: "Admin created Successfully" });

  }
  catch (err) {
    next(err);
  }
};

exports.adminLogin = async (req, res, next) => {
  try {
    const {email,password}=req.body;
    let admin = await Admin.findOne({ email });

    if (!admin) {
      return next(new AppError("Admin not found", 404));
    }

    if (!admin.isApproved)
      throw new AppError("Not approved", 403);

    if (admin.lockUntil > Date.now())
      throw new AppError("Account locked", 429);

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
        permissions: admin.permissions || [],
        allowedRegions: admin.allowedRegions || []
      }
    });
  }
  catch (err) {
    next(err); //let Global error handler deal with it
  }
};

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
    const { domainName, status } = req.body;
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
      status: status || "Available",
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
      servicecategoryImage,
      status
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
        price: price != null ? Math.round(Number(price)) : price,
        durationInMinutes,
        employeeCount,
        status: status || "Available",
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
          price: price != null ? Math.round(Number(price)) : price,
          durationInMinutes,
          employeeCount,
          status: status || "Available",
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
    const rawRegion = req.query.region ? normalizeRegionName(req.query.region) : null;
    const regionFilter = rawRegion && rawRegion !== "all"
      ? { $or: [{ region: rawRegion }, { city: rawRegion }] }
      : {};

    const singleemployee = await SingleEmployee.find(regionFilter).sort({ createdAt: -1 });
    const multipleEmployee = await MultipleEmployee.find(regionFilter).populate('members', 'fullname empId').sort({ createdAt: -1 });
    const toolshop = await ToolShop.find(regionFilter).populate('categories', 'domainpartname').sort({ createdAt: -1 });

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

    // 1. Clean up images of related ServiceLists & Subservices
    const serviceLists = await ServiceList.find({ DomainServiceId: id });
    for (const list of serviceLists) {
      if (list.serviceCategory && list.serviceCategory.length > 0) {
        for (const cat of list.serviceCategory) {
          if (cat.servicecategoryImagePublicId) {
            try {
              await deleteFromCloudinary(cat.servicecategoryImagePublicId);
            } catch (cloudinaryErr) {
              console.error(`Failed to delete image ${cat.servicecategoryImagePublicId} from Cloudinary:`, cloudinaryErr);
            }
          }
        }
      }
    }

    // 2. Cascade delete related ServiceLists
    await ServiceList.deleteMany({ DomainServiceId: id });

    // 3. Delete Domain Service image
    await deleteFromCloudinary(service.serviceImagePublicId);

    // 4. Delete Domain Service document
    await service.deleteOne();

    res.json({ success: true, message: "Service and all associated lists/subservices deleted successfully" });
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

    if (req.body.status) {
      update.status = req.body.status;
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

    if (req.body.price !== undefined) {
      category.price = Math.round(Number(req.body.price));
    }

    if (req.body.durationInMinutes) {
      category.durationInMinutes = req.body.durationInMinutes;
    }

    if (req.body.employeeCount) {
      category.employeeCount = req.body.employeeCount;
    }

    if (req.body.status) {
      category.status = req.body.status;
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
    let filter = {};
    if (req.role !== ROLES.SUPER_ADMIN && req.employee?.allowedRegions?.length > 0) {
      const allowed = req.employee.allowedRegions;
      if (!allowed.includes("ALL") && !allowed.includes("all")) {
        const regexes = allowed.map(r => new RegExp(r, "i"));
        filter = {
          $or: [
            { region: { $in: regexes } },
            { city: { $in: regexes } }
          ]
        };
      }
    }

    const bookings = await Booking.find(filter)
      .populate("user")
      .populate("primaryEmployee")
      .populate("servicerCompany")
      .select("-addressTitle")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      bookings: bookings || []
    });
  } catch (err) {
    next(err);
  }
};

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
    // Optional region filter from query string e.g. ?region=trichy
    const rawRegion = req.query.region ? normalizeRegionName(req.query.region) : null;
    const hasRegion = rawRegion && rawRegion !== "all";

    // Helper for date ranges
    const getStartOf = (unit, count) => {
      const d = new Date(now);
      if (unit === 'day')   d.setDate(d.getDate() - count);
      if (unit === 'week')  d.setDate(d.getDate() - (count * 7));
      if (unit === 'month') d.setMonth(d.getMonth() - count);
      if (unit === 'year')  d.setFullYear(d.getFullYear() - count);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    // Resolve User and Employee IDs dynamically in that region/city for legacy record compatibility
    let bookingRegionMatch = {};
    let empRegionMatch = {};
    let userRegionMatch = {};
    let partRegionMatch = {};
    let commissionRegionMatch = {};

    if (hasRegion) {
      const [usersInRegion, singlesInRegion, multiplesInRegion, shopsInRegion] = await Promise.all([
        User.find({ $or: [{ region: rawRegion }, { city: rawRegion }] }).select("_id"),
        SingleEmployee.find({ $or: [{ region: rawRegion }, { city: rawRegion }] }).select("_id"),
        MultipleEmployee.find({ $or: [{ region: rawRegion }, { city: rawRegion }] }).select("_id"),
        ToolShop.find({ $or: [{ region: rawRegion }, { city: rawRegion }] }).select("_id")
      ]);

      const userIds = usersInRegion.map(u => u._id);
      const singleIds = singlesInRegion.map(e => e._id);
      const multipleIds = multiplesInRegion.map(e => e._id);
      const employeeIds = [...singleIds, ...multipleIds];
      const shopIds = shopsInRegion.map(s => s._id);

      bookingRegionMatch = {
        $or: [
          { region: rawRegion },
          { city: rawRegion },
          { user: { $in: userIds } },
          { primaryEmployee: { $in: employeeIds } },
          { servicerCompany: { $in: employeeIds } }
        ]
      };

      empRegionMatch = { $or: [{ region: rawRegion }, { city: rawRegion }] };
      userRegionMatch = { $or: [{ region: rawRegion }, { city: rawRegion }] };
      partRegionMatch = { employeeId: { $in: employeeIds } };
      commissionRegionMatch = { empId: { $in: [...employeeIds, ...shopIds] } };
    }

    // 1. Basic Counts (filtered by region)
    const [singleCount, multiCount, shopCount, bookingCount, userCount] = await Promise.all([
      SingleEmployee.countDocuments(empRegionMatch),
      MultipleEmployee.countDocuments(empRegionMatch),
      ToolShop.countDocuments(empRegionMatch),
      Booking.countDocuments(bookingRegionMatch),
      User.countDocuments(userRegionMatch)
    ]);

    // 2. Revenue Totals (filtered by region)
    const [serviceRevenueStats, partRevenueStats, commissionStats] = await Promise.all([
      Booking.aggregate([
        { $match: { status: BOOKING_STATUS.COMPLETED, ...bookingRegionMatch } },
        { $group: { _id: null, total: { $sum: "$totalServicePrice" } } }
      ]),
      PartRequest.aggregate([
        { $match: { status: PART_REQUEST_STATUS.COLLECTED, ...partRegionMatch } },
        { $group: { _id: null, total: { $sum: "$totalCost" } } }
      ]),
      Booking.aggregate([
        { $match: { paymentStatus: { $in: ["paid", "partially_paid"] }, ...bookingRegionMatch } },
        { $group: { _id: null, total: { $sum: "$advanceAmount" } } }
      ])
    ]);

    const totalServiceRevenue   = serviceRevenueStats[0]?.total || 0;
    const totalPartRevenue      = partRevenueStats[0]?.total    || 0;
    const totalCommissionPrice  = commissionStats[0]?.total     || 0;
    const grandTotalRevenue     = totalServiceRevenue + totalPartRevenue;

    // 3. Trends Aggregation Helper
    const getTrends = async (startDate, groupFormat) => {
      const [service, parts, commissions] = await Promise.all([
        Booking.aggregate([
          { $match: { status: BOOKING_STATUS.COMPLETED, createdAt: { $gte: startDate }, ...bookingRegionMatch } },
          { $group: { _id: groupFormat, serviceRevenue: { $sum: "$totalServicePrice" } } },
          { $sort: { "_id": 1 } }
        ]),
        PartRequest.aggregate([
          { $match: { status: PART_REQUEST_STATUS.COLLECTED, createdAt: { $gte: startDate }, ...partRegionMatch } },
          { $group: { _id: groupFormat, partRevenue: { $sum: "$totalCost" } } },
          { $sort: { "_id": 1 } }
        ]),
        Booking.aggregate([
          { $match: { paymentStatus: { $in: ["paid", "partially_paid"] }, createdAt: { $gte: startDate }, ...bookingRegionMatch } },
          { $group: { _id: groupFormat, commissionRevenue: { $sum: "$advanceAmount" } } },
          { $sort: { "_id": 1 } }
        ])
      ]);
      return { service, parts, commissions };
    };

    // Define Timeframes
    const dayStart   = getStartOf('day',   7);
    const weekStart  = getStartOf('week',  8);
    const monthStart = getStartOf('month', 6);
    const yearStart  = getStartOf('year',  5);

    // Run Aggregations
    const [dailyData, weeklyData, monthlyData, yearlyData] = await Promise.all([
      getTrends(dayStart,   { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }),
      getTrends(weekStart,  { $concat: [{ $toString: { $year: "$createdAt" } }, "-W", { $toString: { $week: "$createdAt" } }] }),
      getTrends(monthStart, { $dateToString: { format: "%Y-%m", date: "$createdAt" } }),
      getTrends(yearStart,  { $dateToString: { format: "%Y",    date: "$createdAt" } })
    ]);

    // Format Trends Helper
    const formatTrends = (data, timeframe, count) => {
      const merged = {};

      for (let i = 0; i < count; i++) {
        const d = new Date(now);
        let key, label;

        if (timeframe === 'day') {
          d.setDate(d.getDate() - i);
          key   = d.toISOString().split('T')[0];
          label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        } else if (timeframe === 'week') {
          d.setDate(d.getDate() - (i * 7));
          const weekNum = Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
          key   = `${d.getFullYear()}-W${weekNum}`;
          label = `Week ${weekNum}`;
        } else if (timeframe === 'month') {
          d.setMonth(d.getMonth() - i);
          key   = d.toISOString().slice(0, 7);
          label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } else if (timeframe === 'year') {
          d.setFullYear(d.getFullYear() - i);
          key   = d.getFullYear().toString();
          label = key;
        }

        merged[key] = { label, serviceRevenue: 0, partRevenue: 0, commissionRevenue: 0, totalRevenue: 0 };
      }

      data.service.forEach(item     => { if (merged[item._id]) { merged[item._id].serviceRevenue    = item.serviceRevenue;    merged[item._id].totalRevenue += item.serviceRevenue; } });
      data.parts.forEach(item       => { if (merged[item._id]) { merged[item._id].partRevenue       = item.partRevenue;       merged[item._id].totalRevenue += item.partRevenue; } });
      data.commissions.forEach(item => { if (merged[item._id]) { merged[item._id].commissionRevenue = item.commissionRevenue; } });

      return Object.values(merged).reverse();
    };

    // 4. Booking Status Distribution (filtered by region)
    const statusDistribution = await Booking.aggregate([
      { $match: bookingRegionMatch },
      { $group: { _id: "$status", count: { $count: {} } } }
    ]);

    res.json({
      success: true,
      region: rawRegion || "all",
      counts: {
        singleEmployee:   singleCount,
        multipleEmployee: multiCount,
        toolShop:         shopCount,
        totalBookings:    bookingCount,
        totalemp:         singleCount + multiCount + shopCount,
        userCount:        userCount
      },
      revenueOverview: {
        totalServiceRevenue,
        totalPartRevenue,
        totalCommission:      totalCommissionPrice,
        totalCommissionPrice,
        grandTotalRevenue
      },
      trends: {
        daily:   formatTrends(dailyData,   'day',   7),
        weekly:  formatTrends(weeklyData,  'week',  8),
        monthly: formatTrends(monthlyData, 'month', 6),
        yearly:  formatTrends(yearlyData,  'year',  5)
      },
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

    // Optional region filter: ?region=trichy
    const rawRegion = req.query.region ? normalizeRegionName(req.query.region) : null;
    let regionFilter = {};

    if (rawRegion && rawRegion !== "all") {
      const [usersInRegion, singlesInRegion, multiplesInRegion] = await Promise.all([
        User.find({ $or: [{ region: rawRegion }, { city: rawRegion }] }).select("_id"),
        SingleEmployee.find({ $or: [{ region: rawRegion }, { city: rawRegion }] }).select("_id"),
        MultipleEmployee.find({ $or: [{ region: rawRegion }, { city: rawRegion }] }).select("_id")
      ]);

      const userIds = usersInRegion.map(u => u._id);
      const singleIds = singlesInRegion.map(e => e._id);
      const multipleIds = multiplesInRegion.map(e => e._id);
      const employeeIds = [...singleIds, ...multipleIds];

      regionFilter = {
        $or: [
          { region: rawRegion },
          { city: rawRegion },
          { user: { $in: userIds } },
          { primaryEmployee: { $in: employeeIds } },
          { servicerCompany: { $in: employeeIds } }
        ]
      };
    }

    const liveBookings = await Booking.find({ status: { $in: liveStatuses }, ...regionFilter })
      .populate('user', 'fullName phoneNo region city')
      .populate('primaryEmployee', 'fullname phoneNo region city')
      .populate('servicerCompany', 'storeName ownerName region city')
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
    // Optional region filter: ?region=trichy
    const rawRegion = req.query.region ? normalizeRegionName(req.query.region) : null;
    const regionFilter = rawRegion && rawRegion !== "all"
      ? { $or: [{ region: rawRegion }, { city: rawRegion }] }
      : {};

    const users = await User.find(regionFilter).sort({ createdAt: -1 });
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
      status: { $nin: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCALLED] },
      $or: [
        { status: BOOKING_STATUS.NO_PROVIDER },
        { status: BOOKING_STATUS.MANUAL_ASSIGN },
        { assignmentStatus: "FAILED" },
        { isManuallyAssigned: true }
      ]
    })
      .populate('user', 'fullName phoneNo')
      .populate('domainService', 'domainName')
      .populate('primaryEmployee', 'fullname phoneNo')
      .populate('servicerCompany', 'storeName')
      .sort({ createdAt: -1 })
      .lean();

    // Map the status for the frontend so it explicitly shows correct status and matches options
    const formattedBookings = bookings.map(booking => {
      let displayStatus = booking.status;
      if (booking.status === BOOKING_STATUS.NO_PROVIDER) {
        displayStatus = 'no_provider';
      } else if ((booking.status === BOOKING_STATUS.CONFIRMED || booking.status === BOOKING_STATUS.MANUAL_ASSIGN) && booking.assignmentStatus === "FAILED" && !booking.isManuallyAssigned) {
        displayStatus = 'failed';
      } else if (booking.status) {
        displayStatus = booking.status.toLowerCase();
      }
      return {
        ...booking,
        status: displayStatus
      };
    });

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

    // --- Commission Owed Check (Disabled/Bypassed) ---
    /*
    const unpaidData = await Commission.aggregate([
      { $match: { empId: new mongoose.Types.ObjectId(servicerId), status: { $ne: 'PAID' } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]);
    const totalUnpaid = unpaidData[0]?.total || 0;
    if (totalUnpaid >= 1000) {
      return next(new AppError("Servicer is blocked due to outstanding commission >= 1000", 400));
    }
    */

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

    if (status && status.trim() !== '') {
      const sUpper = status.toUpperCase();
      if (sUpper === 'PAID' || sUpper === 'PENDING') {
        filter.paymentStatus = sUpper === 'PAID' ? 'paid' : 'pending';
      } else {
        filter.status = status.toLowerCase();
      }
    }

    if (empId && typeof empId === 'string' && empId.trim() !== '' && mongoose.Types.ObjectId.isValid(empId)) {
      const empObjectId = new mongoose.Types.ObjectId(empId);
      filter.$or = [
        { primaryEmployee: empObjectId },
        { servicerCompany: empObjectId }
      ];
    }

    const bookings = await Booking.find(filter)
      .populate({ path: "user", strictPopulate: false })
      .populate({ path: "primaryEmployee", strictPopulate: false })
      .populate({ path: "servicerCompany", strictPopulate: false })
      .populate({ path: "employees", strictPopulate: false })
      .populate({ path: "offeredEmployee", strictPopulate: false })
      .populate({ path: "teamLeader", strictPopulate: false })
      .populate({ path: "selectedToolShop", strictPopulate: false })
      .populate({ path: "domainService", strictPopulate: false })
      .sort({ createdAt: -1 });

    const commissions = bookings.map(b => {
      // User details extraction
      const u = b.user || b.userId;
      let userName = '';
      let userPhone = '';

      if (u && typeof u === 'object') {
        userName = u.fullName || u.fullname || u.name || u.email || '';
        userPhone = u.phoneNo || u.phone || u.mobile || '';
      }

      if (!userName) userName = b.userName || b.name || b.customerName || b.fullName || b.fullname || '';
      if (!userPhone) userPhone = b.userPhone || b.phoneNo || b.customerPhone || b.phone || b.mobile || '';

      if (!userName || userName.trim() === '') {
        userName = `Customer (${b._id ? b._id.toString().substring(0, 6) : 'User'})`;
      }
      if (!userPhone || userPhone.trim() === '') {
        userPhone = 'N/A';
      }

      const address = b.address || (Array.isArray(u?.addresses) && u?.addresses[0]?.address) || 'N/A';

      // Service details
      const serviceName = b.serviceCategoryName || b.domainService?.domainName || 'Service';

      // Servicer & Manual Assignment extraction
      let servicerName = '';
      let servicerPhone = '';
      let servicerType = 'SINGLE';
      let servicerId = null;

      if (b.externalTechnicianName) {
        servicerName = `${b.externalTechnicianName} (Manual)`;
        servicerPhone = b.externalTechnicianPhone || 'N/A';
        servicerType = 'MANUAL_EXTERNAL';
        servicerId = b.externalTechnicianPhone || b._id.toString();
      } else if (b.servicerCompany && typeof b.servicerCompany === 'object') {
        servicerName = b.servicerCompany.storeName || b.servicerCompany.ownerName || 'Company';
        servicerPhone = b.servicerCompany.phoneNo || b.servicerCompany.phone || 'N/A';
        servicerType = 'TEAM';
        servicerId = b.servicerCompany._id?.toString() || 'TEAM';
      } else if (b.primaryEmployee && typeof b.primaryEmployee === 'object') {
        servicerName = b.primaryEmployee.fullname || b.primaryEmployee.fullName || b.primaryEmployee.storeName || 'Technician';
        servicerPhone = b.primaryEmployee.phoneNo || b.primaryEmployee.phone || 'N/A';
        servicerType = 'SINGLE';
        servicerId = b.primaryEmployee._id?.toString() || 'SINGLE';
      } else if (b.offeredEmployee && typeof b.offeredEmployee === 'object') {
        servicerName = `${b.offeredEmployee.fullname || b.offeredEmployee.storeName || 'Technician'} (Offered)`;
        servicerPhone = b.offeredEmployee.phoneNo || b.offeredEmployee.phone || 'N/A';
        servicerType = 'SINGLE';
        servicerId = b.offeredEmployee._id?.toString() || 'OFFERED';
      } else if (b.teamLeader && typeof b.teamLeader === 'object') {
        servicerName = b.teamLeader.fullname || b.teamLeader.storeName || 'Team Leader';
        servicerPhone = b.teamLeader.phoneNo || 'N/A';
        servicerType = 'TEAM';
        servicerId = b.teamLeader._id?.toString() || 'LEADER';
      } else if (Array.isArray(b.employees) && b.employees.length > 0 && typeof b.employees[0] === 'object') {
        const emp0 = b.employees[0];
        servicerName = emp0.fullname || emp0.storeName || 'Technician';
        servicerPhone = emp0.phoneNo || 'N/A';
        servicerType = 'SINGLE';
        servicerId = emp0._id?.toString() || 'EMP';
      } else if (b.selectedToolShop && typeof b.selectedToolShop === 'object') {
        servicerName = b.selectedToolShop.shopName || b.selectedToolShop.storeName || 'Tool Shop';
        servicerPhone = b.selectedToolShop.phoneNo || 'N/A';
        servicerType = 'TOOLSHOP';
        servicerId = b.selectedToolShop._id?.toString() || 'TOOLSHOP';
      } else if (b.servicerName || b.empName || b.providerName) {
        servicerName = b.servicerName || b.empName || b.providerName;
        servicerPhone = b.servicerPhone || b.empPhone || b.providerPhone || 'N/A';
        servicerId = b._id.toString();
      } else {
        servicerName = 'Unassigned / System';
        servicerPhone = 'N/A';
        servicerId = 'UNASSIGNED';
      }

      // Payment details
      const total = Number(b.totalPrice) || Number(b.totalServicePrice) || Number(b.price) || 0;
      const pType = (b.paymentType || 'FULL').toUpperCase();
      const adv = pType === 'FULL' ? total : (Number(b.advanceAmount) || Number(b.advancePayment) || 0);
      const rem = pType === 'FULL' ? 0 : (Number(b.remainingAmount) || Number(b.remainingPayment) || (total > adv ? total - adv : 0));
      const isPaid = (b.paymentStatus || '').toLowerCase() === 'paid';
      const userPaidAmt = pType === 'FULL' || isPaid ? total : adv;

      return {
        _id: b._id.toString(),
        bookingId: b._id.toString(),
        userId: {
          _id: u?._id || b._id.toString(),
          fullName: userName,
          fullname: userName,
          phoneNo: userPhone,
          phone: userPhone,
          address: address
        },
        empId: {
          _id: servicerId,
          fullname: servicerName,
          fullName: servicerName,
          storeName: servicerName,
          phoneNo: servicerPhone,
          phone: servicerPhone
        },
        empType: servicerType,
        address: address,
        userName: userName,
        userPhone: userPhone,
        servicerName: servicerName,
        servicerPhone: servicerPhone,
        serviceName: serviceName,
        isManuallyAssigned: !!b.isManuallyAssigned || !!b.externalTechnicianName,
        userPaidAmount: userPaidAmt,
        commissionAmount: userPaidAmt,
        advanceAmount: adv,
        remainingAmount: rem,
        totalPrice: total,
        paymentType: pType,
        serviceId: { serviceName: serviceName },
        serviceCategoryName: serviceName,
        status: isPaid ? 'PAID' : 'PENDING',
        createdAt: b.createdAt
      };
    });

    // Build Summary Map dynamically from commissions to ensure 100% accuracy for all servicers (including manual assigns)
    const summaryMap = {};
    commissions.forEach(c => {
      const key = c.servicerName || 'Unassigned';
      if (!summaryMap[key]) {
        summaryMap[key] = {
          _id: c.empId?._id || key,
          name: c.servicerName,
          phoneNo: c.servicerPhone !== 'N/A' ? c.servicerPhone : '',
          type: c.empType,
          isManuallyAssigned: c.isManuallyAssigned,
          totalCommission: 0,
          totalPaid: 0,
          totalPending: 0
        };
      }
      summaryMap[key].totalCommission += Number(c.totalPrice) || 0;
      summaryMap[key].totalPaid += Number(c.advanceAmount) || 0;
      summaryMap[key].totalPending += Number(c.remainingAmount) || 0;
    });

    const summary = Object.values(summaryMap).sort((a, b) => b.totalPaid - a.totalPaid);

    res.json({ success: true, commissions, summary });
  } catch (err) {
    console.error("Error in getAllCommissionsAdmin:", err);
    next(err);
  }
};


/* ======================================================
   ADMIN MANUAL ASSIGN BOOKING
====================================================== */
exports.adminManualAssignBooking = async (req, res, next) => {
  try {
    const { bookingId, servicerId, servicerType, assignmentNotes, eta, externalName, externalPhone } = req.body;
    const io = req.app.get("io");

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return next(new AppError("Invalid booking ID", 400));
    }

    const isExternal = servicerId === "external" || !!externalName;

    if (!isExternal && !mongoose.Types.ObjectId.isValid(servicerId)) {
      return next(new AppError("Invalid servicer ID", 400));
    }

    const booking = await Booking.findById(bookingId).populate("user");
    if (!booking) return next(new AppError("Booking not found", 404));

    let servicerName = "";
    let servicerPhone = "";

    const { generateStartOTP } = require("../services/booking.service");
    const { sendNotification } = require("../utils/notification.util");

    if (isExternal) {
      booking.primaryEmployee = null;
      booking.primaryEmployeeModel = "SingleEmployee";
      booking.employees = [];
      booking.servicerCompany = null;
      booking.teamLeader = null;
      booking.teamHelpers = [];
      booking.externalTechnicianName = externalName || "Technician";
      booking.externalTechnicianPhone = externalPhone || "";

      servicerName = externalName || "Technician";
      servicerPhone = externalPhone || "";
    } else if (
      servicerType &&
      (servicerType.toLowerCase() === "single" ||
       servicerType.toLowerCase() === "single_employee" ||
       servicerType.toLowerCase() === ROLES.SINGLE_EMPLOYEE.toLowerCase())
    ) {
      const employee = await SingleEmployee.findById(servicerId);
      if (!employee) return next(new AppError("Technician not found", 404));

      booking.primaryEmployee = employee._id;
      booking.primaryEmployeeModel = "SingleEmployee";
      booking.employees = [employee._id];
      booking.servicerCompany = null;
      booking.teamLeader = null;
      booking.teamHelpers = [];

      servicerName = employee.fullname;
      servicerPhone = employee.phoneNo || employee.phoneno || "";

      await SingleEmployee.findByIdAndUpdate(employee._id, {
        availabilityStatus: "BUSY",
        offerBookingId: null
      });
    } else {
      const team = await MultipleEmployee.findById(servicerId);
      if (!team) return next(new AppError("Team not found", 404));

      const leaderId = team.leader || team.members[0];
      const helperIds = team.members.filter(m => m.toString() !== leaderId.toString());

      booking.servicerCompany = team._id;
      booking.primaryEmployee = leaderId;
      booking.primaryEmployeeModel = "SingleEmployee";
      booking.teamLeader = leaderId;
      booking.teamHelpers = helperIds;
      booking.employees = [leaderId, ...helperIds];

      const leader = await SingleEmployee.findById(leaderId);
      servicerName = leader ? leader.fullname : (team.storeName || "Team Leader");
      servicerPhone = leader ? (leader.phoneNo || leader.phoneno || "") : "";

      await MultipleEmployee.findByIdAndUpdate(team._id, {
        teamStatus: "BUSY",
        offerBookingId: null
      });
      await SingleEmployee.updateMany(
        { _id: { $in: [leaderId, ...helperIds] } },
        { availabilityStatus: "BUSY", offerBookingId: null }
      );
    }

    booking.isManuallyAssigned = true;
    booking.assignmentStatus = "ASSIGNED";
    booking.status = BOOKING_STATUS.ASSIGNED;
    booking.assignmentNotes = assignmentNotes || "";
    booking.location = {
      ...booking.location,
      eta: eta || null
    };

    await booking.save();

    const { otp } = await generateStartOTP(booking._id);

    const serviceDetails = booking.cartItems && booking.cartItems.length > 0 
        ? booking.cartItems.map(item => `${item.serviceCategoryName} (x${item.quantity || 1})`).join(", ")
        : booking.serviceCategoryName;

    await sendNotification({
        userId: booking.user._id,
        title: "Technician Assigned",
        message: `A technician has been manually assigned to your booking. Name: ${servicerName}, Phone: ${servicerPhone}, Estimated Arrival Time: ${eta || "Not specified"}.`,
        type: "SYSTEM",
        data: {
            bookingId: booking._id,
            technicianName: servicerName,
            phoneNumber: servicerPhone,
            eta: eta || "",
            serviceName: booking.serviceCategoryName,
            serviceDetails
        },
        io
    });

   if (booking.user?.socketId) {
      io.to(booking.user.socketId).emit("servicer-accepted", {
        booking,
        otp,
        technicianName: servicerName,
        phoneNumber: servicerPhone,
        eta: eta
      });
    }

    const memberIds = [booking.primaryEmployee].filter(Boolean);
    if (booking.teamHelpers && booking.teamHelpers.length > 0) {
      memberIds.push(...booking.teamHelpers);
    }
    for (const memberId of memberIds) {
      io.to(`employee_${memberId}`).emit("booking-confirmed", { booking, otp });
    }

    res.status(200).json({
      success: true,
      message: "Technician manually assigned successfully",
      booking
    });

  } catch (err) {
    next(err);
  }
};

/* ======================================================
   ADMIN UPDATE BOOKING STATUS
====================================================== */
exports.adminUpdateBookingStatus = async (req, res, next) => {
  try {
    const { bookingId, status, employeeId, employeeType, notes } = req.body;
    const io = req.app.get("io");

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return next(new AppError("Invalid booking ID", 400));
    }

    const booking = await Booking.findById(bookingId).populate("user");
    if (!booking) return next(new AppError("Booking not found", 404));

    const oldStatus = booking.status;
    const { resetAvailability, assignNextServicer, assignNextTeam } = require("../services/booking.service");
    const { sendNotification } = require("../utils/notification.util");
    const PAYMENT_STATUS = require("../enum/payment.enum");

    if (status === "retry_assignment") {
      booking.status = BOOKING_STATUS.CONFIRMED;
      booking.assignmentStatus = "SEARCHING";
      booking.isManuallyAssigned = false;
      booking.dispatchAttempts = 0;
      booking.rejectedEmployees = [];
      booking.rejectedMultipleEmployee = [];
      
      booking._updatedBy = "ADMIN";
      booking._statusNotes = notes || `Admin retried assignment`;
      await booking.save();

      const employeeCount = booking.employeeCount;
      if (employeeCount === 1) {
        assignNextServicer({
          bookingId: booking._id.toString(),
          coordinates: booking.location.coordinates,
          io,
        });
      } else {
        assignNextTeam({
          bookingId: booking._id.toString(),
          coordinates: booking.location.coordinates,
          employeeCount,
          io,
        });
      }

      await sendNotification({
        userId: booking.user._id,
        title: "Retrying Technician Assignment",
        message: `We are retrying technician assignment for your booking.`,
        type: "SYSTEM",
        data: { bookingId: booking._id },
        io
      });
      
      return res.status(200).json({
        success: true,
        message: "Assignment retry started",
        booking
      });
    }

    booking.status = status;
    booking._updatedBy = "ADMIN";
    booking._statusNotes = notes || `Admin updated status from ${oldStatus} to ${status}`;

    if (status === BOOKING_STATUS.ASSIGNED) {
      if (!booking.isManuallyAssigned) {
        booking.assignmentStatus = "ASSIGNED";
      }
      if (employeeId) {
        const empTypeLower = (employeeType || "").toLowerCase();
        if (empTypeLower === "single" || empTypeLower === "single_employee" || empTypeLower === ROLES.SINGLE_EMPLOYEE.toLowerCase()) {
          booking.primaryEmployee = employeeId;
          booking.employees = [employeeId];
          booking.primaryEmployeeModel = "SingleEmployee";
          await SingleEmployee.findByIdAndUpdate(employeeId, { availabilityStatus: "BUSY" });
        } else {
          booking.servicerCompany = employeeId;
          const team = await MultipleEmployee.findById(employeeId);
          if (team) {
            const leaderId = team.leader || team.members[0];
            booking.primaryEmployee = leaderId;
            booking.primaryEmployeeModel = "SingleEmployee";
            booking.teamLeader = leaderId;
            booking.teamHelpers = team.members.filter(m => m.toString() !== leaderId.toString());
            booking.employees = team.members;
            await MultipleEmployee.findByIdAndUpdate(employeeId, { teamStatus: "BUSY" });
            await SingleEmployee.updateMany({ _id: { $in: team.members } }, { availabilityStatus: "BUSY" });
          }
        }
      }
      
      const otp = Math.floor(1000 + Math.random() * 9000);
      booking.StartWorkOTP = otp;
      
      await sendNotification({
        userId: booking.user._id,
        title: "Booking Status Updated",
        message: `Your booking status has been updated to ASSIGNED by the administrator.`,
        type: "SYSTEM",
        data: { bookingId: booking._id },
        io
      });
      if (booking.user?.socketId) {
        io.to(booking.user.socketId).emit("servicer-accepted", { booking, otp });
      }
    } else if (status === BOOKING_STATUS.IN_PROGRESS) {
      await sendNotification({
        userId: booking.user._id,
        title: "Service Started",
        message: `Your service has started!`,
        type: "SYSTEM",
        data: { bookingId: booking._id },
        io
      });
      if (booking.user?.socketId) {
        io.to(booking.user.socketId).emit("booking-started", { bookingId: booking._id });
      }
    } else if (status === BOOKING_STATUS.COMPLETED) {
      booking.paymentStatus = PAYMENT_STATUS.PAID;
      booking.completedAt = new Date();
      await resetAvailability(booking);
      
      const empId = booking.servicerCompany || booking.primaryEmployee?._id || booking.primaryEmployee;
      if (empId) {
        const empType = booking.servicerCompany ? "team" : "single";
        const { recordCommission } = require("../services/booking.service");
        await recordCommission(booking, empId, empType, null, io);
      }

      await sendNotification({
        userId: booking.user._id,
        title: "Service Completed",
        message: `Your service has been marked as completed!`,
        type: "SYSTEM",
        data: { bookingId: booking._id },
        io
      });
      if (booking.user?.socketId) {
        io.to(booking.user.socketId).emit("booking-completed", { bookingId: booking._id });
      }
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status} successfully`,
      booking
    });

  } catch (err) {
    next(err);
  }
};

/* ======================================================
   ADMIN SEND CUSTOM NOTIFICATION
====================================================== */
exports.adminSendNotification = async (req, res, next) => {
  try {
    const { title, message, targetAudience, targetId, metadata = {} } = req.body;
    const io = req.app.get("io");

    if (!title || !message || !targetAudience) {
      return next(new AppError("Title, message, and target audience are required", 400));
    }

    const { sendNotification } = require("../utils/notification.util");

    if (targetAudience === "single_user") {
      if (!targetId) return next(new AppError("Target ID is required for single user", 400));
      const targetUser = await User.findById(targetId);
      if (!targetUser) return next(new AppError("User not found", 404));

      await sendNotification({
        userId: targetUser._id,
        title,
        message,
        type: "ALERT",
        data: metadata,
        io
      });
    } else if (targetAudience === "all_users") {
      const users = await User.find({ role: ROLES.USER });
      for (const u of users) {
        await sendNotification({
          userId: u._id,
          title,
          message,
          type: "SYSTEM",
          data: metadata,
          io
        });
      }
    } else if (targetAudience === "employees") {
      const employees = await SingleEmployee.find({ isActive: true });
      for (const emp of employees) {
        await sendNotification({
          empId: emp._id,
          empModel: "SingleEmployee",
          title,
          message,
          type: "SYSTEM",
          data: metadata,
          io
        });
      }
    } else if (targetAudience === "teams") {
      const teams = await MultipleEmployee.find({ isActive: true });
      for (const team of teams) {
        await sendNotification({
          empId: team._id,
          empModel: "MultipleEmployee",
          title,
          message,
          type: "SYSTEM",
          data: metadata,
          io
        });
      }
    } else {
      return next(new AppError("Invalid target audience", 400));
    }

    res.status(200).json({
      success: true,
      message: "Custom notification sent successfully"
    });
  } catch (err) {
    next(err);
  }
};

exports.getRegions = async (req, res, next) => {
  try {
    const singleemployee = await SingleEmployee.find({}, 'region city').lean();
    const multipleEmployee = await MultipleEmployee.find({}, 'region city').lean();
    const toolshop = await ToolShop.find({}, 'region city').lean();
    const bookings = await Booking.find({}, 'region city').lean();
    const admins = await Admin.find({}, 'region').lean();

    const allStrings = [
      ...singleemployee.map(e => e.region),
      ...singleemployee.map(e => e.city),
      ...multipleEmployee.map(e => e.region),
      ...multipleEmployee.map(e => e.city),
      ...toolshop.map(t => t.region),
      ...toolshop.map(t => t.city),
      ...bookings.map(b => b.region),
      ...bookings.map(b => b.city),
      ...admins.map(a => a.region)
    ].filter(Boolean);

    const regions = Array.from(new Set(allStrings.map(r => r.toLowerCase().trim())));
    res.json({
      success: true,
      regions
    });
  } catch (err) {
    next(err);
  }
};

exports.addEmployee = async (req, res, next) => {
  try {
    const {
      employeeType,
      phoneNo,
      email,
      password,
      region,
      city,
      capabilities,
      fullname,
      ownerName,
      storeName,
      shopName,
      gstNo
    } = req.body;

    const cleanPhone = phoneNo.trim();
    const maskedPhone = cleanPhone.slice(0, 2) + "******" + cleanPhone.slice(-2);

    // Default location based on region
    let coordinates = [78.6824, 10.7905]; // Trichy default
    if (region && region.toLowerCase() === 'thanjavur') {
      coordinates = [79.1378, 10.7870];
    }

    let createdEmployee;

    if (employeeType === 'single_employee') {
      createdEmployee = await SingleEmployee.create({
        fullname,
        phoneNo: cleanPhone,
        phoneMasked: maskedPhone,
        address: region ? region.toUpperCase() : "TRICHY",
        aadhaarNo: "DUMMY_AADHAAR",
        aadhaarMasked: "XXXX-XXXX-DUMMY",
        aadhaarHash: "DUMMY_HASH_" + Date.now(),
        location: {
          type: "Point",
          coordinates
        },
        role: ROLES.SINGLE_EMPLOYEE,
        region: region ? normalizeRegionName(region) : "trichy",
        city: city ? normalizeRegionName(city) : "trichy",
        isActive: true,
        verified: "Yes"
      });

      // Map capabilities to EmployeeService
      if (capabilities && capabilities.length > 0) {
        // Find matching domain services
        const matchedServices = await DomainService.find({
          domainName: { $in: capabilities.map(c => new RegExp("^" + c + "$", "i")) }
        });
        if (matchedServices.length > 0) {
          await EmployeeService.create({
            employeeId: createdEmployee._id,
            capableservice: matchedServices.map(s => s._id)
          });
        }
      }
    } else if (employeeType === 'multiple_employee') {
      createdEmployee = await MultipleEmployee.create({
        storeName,
        ownerName,
        storeLocation: region ? region.toUpperCase() : "TRICHY",
        phoneNo: cleanPhone,
        phoneMasked: maskedPhone,
        role: ROLES.MULTIPLE_EMPLOYEE,
        location: {
          type: "Point",
          coordinates
        },
        region: region ? normalizeRegionName(region) : "trichy",
        city: city ? normalizeRegionName(city) : "trichy",
        isActive: true
      });
    } else if (employeeType === 'tool_shop') {
      createdEmployee = await ToolShop.create({
        shopName,
        ownerName,
        gstNo,
        storeLocation: region ? region.toUpperCase() : "TRICHY",
        phoneNo: cleanPhone,
        phoneMasked: maskedPhone,
        role: ROLES.TOOL_SHOP,
        location: {
          type: "Point",
          coordinates
        },
        region: region ? normalizeRegionName(region) : "trichy",
        city: city ? normalizeRegionName(city) : "trichy",
        isActive: true
      });
    }

    res.status(201).json({
      success: true,
      message: "Employee onboarded successfully",
      employee: createdEmployee
    });
  } catch (err) {
    next(err);
  }
};

exports.updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      employeeType,
      phoneNo,
      fullname,
      ownerName,
      storeName,
      shopName,
      gstNo,
      region,
      city,
      capabilities
    } = req.body;

    let updatedEmployee;

    if (employeeType === 'single_employee' || employeeType === ROLES.SINGLE_EMPLOYEE) {
      const updates = {};
      if (fullname) updates.fullname = fullname;
      if (phoneNo) {
        updates.phoneNo = phoneNo.trim();
        updates.phoneMasked = phoneNo.trim().slice(0, 2) + "******" + phoneNo.trim().slice(-2);
      }
      if (region) {
        updates.region = normalizeRegionName(region);
        updates.address = region.toUpperCase();
      }
      if (city) updates.city = normalizeRegionName(city);

      updatedEmployee = await SingleEmployee.findByIdAndUpdate(id, updates, { new: true });

      // Update capabilities if specified
      if (capabilities) {
        // Remove existing mapping
        await EmployeeService.deleteMany({ employeeId: id });
        
        // Find matching domain services
        const matchedServices = await DomainService.find({
          domainName: { $in: capabilities.map(c => new RegExp("^" + c + "$", "i")) }
        });
        if (matchedServices.length > 0) {
          await EmployeeService.create({
            employeeId: id,
            capableservice: matchedServices.map(s => s._id)
          });
        }
      }
    } else if (employeeType === 'multiple_employee' || employeeType === ROLES.MULTIPLE_EMPLOYEE) {
      const updates = {};
      if (storeName) updates.storeName = storeName;
      if (ownerName) updates.ownerName = ownerName;
      if (phoneNo) {
        updates.phoneNo = phoneNo.trim();
        updates.phoneMasked = phoneNo.trim().slice(0, 2) + "******" + phoneNo.trim().slice(-2);
      }
      if (region) {
        updates.region = normalizeRegionName(region);
        updates.storeLocation = region.toUpperCase();
      }
      if (city) updates.city = normalizeRegionName(city);

      updatedEmployee = await MultipleEmployee.findByIdAndUpdate(id, updates, { new: true });
    } else if (employeeType === 'tool_shop' || employeeType === ROLES.TOOL_SHOP) {
      const updates = {};
      if (shopName) updates.shopName = shopName;
      if (ownerName) updates.ownerName = ownerName;
      if (gstNo) updates.gstNo = gstNo;
      if (phoneNo) {
        updates.phoneNo = phoneNo.trim();
        updates.phoneMasked = phoneNo.trim().slice(0, 2) + "******" + phoneNo.trim().slice(-2);
      }
      if (region) {
        updates.region = normalizeRegionName(region);
        updates.storeLocation = region.toUpperCase();
      }
      if (city) updates.city = normalizeRegionName(city);

      updatedEmployee = await ToolShop.findByIdAndUpdate(id, updates, { new: true });
    }

    if (!updatedEmployee) {
      return next(new AppError("Employee not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Employee updated successfully",
      employee: updatedEmployee
    });
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, phoneNo, region, city } = req.body;

    const updates = {};
    if (fullName) updates.fullName = fullName;
    if (phoneNo) {
      updates.phoneNo = phoneNo.trim();
      updates.phoneMasked = phoneNo.trim().slice(0, 2) + "******" + phoneNo.trim().slice(-2);
    }
    if (region) updates.region = normalizeRegionName(region);
    if (city) updates.city = normalizeRegionName(city);

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedUser) {
      return next(new AppError("User not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: updatedUser
    });
  } catch (err) {
    next(err);
  }
};

exports.listAdmins = async (req, res, next) => {
  try {
    const admins = await Admin.find({}, '-password').sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      admins
    });
  } catch (err) {
    next(err);
  }
};

exports.listInvites = async (req, res, next) => {
  try {
    const invites = await Invite.find({}).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      invites
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteInvite = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Invite.findByIdAndDelete(id);
    res.status(200).json({
      success: true,
      message: "Invitation deleted successfully"
    });
  } catch (err) {
    next(err);
  }
};

exports.updateAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullname, email, role, permissions, allowedRegions, isApproved } = req.body;

    const updates = {};
    if (fullname) updates.fullname = fullname;
    if (email) updates.email = email.toLowerCase();
    if (isApproved !== undefined) updates.isApproved = isApproved;
    if (allowedRegions !== undefined && Array.isArray(allowedRegions)) {
      updates.allowedRegions = allowedRegions;
    }
    
    if (role) {
      if (!Object.values(ROLES).includes(role)) {
        return next(new AppError("Invalid role", 400));
      }
      updates.role = role;
    }

    if (permissions && Array.isArray(permissions)) {
      const validPermissions = Object.values(PERMISSIONS);
      const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
      if (invalidPermissions.length > 0) {
        return next(new AppError(`Invalid permissions: ${invalidPermissions.join(', ')}`, 400));
      }
      updates.permissions = permissions;
    }

    const admin = await Admin.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!admin) {
      return next(new AppError("Admin not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      admin
    });
  } catch (err) {
    next(err);
  }
};

exports.removeAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Prevent self-deletion or deleting the last super admin
    const adminToDelete = await Admin.findById(id);
    if (!adminToDelete) {
      return next(new AppError("Admin not found", 404));
    }
    
    if (adminToDelete.role === ROLES.SUPER_ADMIN) {
      // Count super admins
      const superAdminCount = await Admin.countDocuments({ role: ROLES.SUPER_ADMIN });
      if (superAdminCount <= 1) {
        return next(new AppError("Cannot delete the last Super Admin", 400));
      }
    }

    if (adminToDelete._id.toString() === req.employeeId.toString()) {
      return next(new AppError("You cannot delete your own account", 400));
    }

    await Admin.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Administrator removed successfully"
    });
  } catch (err) {
    next(err);
  }
};

exports.getAllReviewsAdmin = async (req, res, next) => {
  try {
    const reviews = await Review.find()
      .populate('user', 'fullName phoneNo email')
      .populate('primaryEmployee', 'fullname phoneNo')
      .populate('company', 'storeName')
      .populate('booking', 'serviceCategoryName address createdAt totalPrice')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      reviews
    });
  } catch (err) {
    next(err);
  }
};

exports.getManagedRegions = async (req, res, next) => {
  try {
    let regions = await RegionModel.find().sort({ name: 1 }).lean();

    if (regions.length === 0) {
      const defaults = [
        { name: "Trichy", code: "trichy", isBookingAllowed: true, description: "Primary service hub" },
        { name: "Thanjavur", code: "thanjavur", isBookingAllowed: true, description: "Delta region hub" },
        { name: "Coimbatore", code: "coimbatore", isBookingAllowed: true, description: "Industrial zone" },
        { name: "Chennai", code: "chennai", isBookingAllowed: true, description: "Metropolitan zone" },
        { name: "Madurai", code: "madurai", isBookingAllowed: true, description: "Southern zone" },
      ];
      await RegionModel.insertMany(defaults);
      regions = await RegionModel.find().sort({ name: 1 }).lean();
    }

    res.status(200).json({
      success: true,
      count: regions.length,
      regions
    });
  } catch (err) {
    next(err);
  }
};

exports.addManagedRegion = async (req, res, next) => {
  try {
    const { name, isBookingAllowed = true, description = "" } = req.body;
    if (!name || !name.trim()) {
      return next(new AppError("Region name is required", 400));
    }

    const cleanName = name.trim();
    const code = normalizeRegionName(cleanName) || cleanName.toLowerCase().replace(/\s+/g, "_");

    const existing = await RegionModel.findOne({
      $or: [{ name: cleanName }, { code }]
    });

    if (existing) {
      existing.isBookingAllowed = Boolean(isBookingAllowed);
      if (description) existing.description = description.trim();
      await existing.save();
      return res.status(200).json({
        success: true,
        message: `Region ${existing.name} updated successfully`,
        region: existing
      });
    }

    const newRegion = await RegionModel.create({
      name: cleanName,
      code,
      isBookingAllowed: Boolean(isBookingAllowed),
      description: description.trim()
    });

    res.status(201).json({
      success: true,
      message: "Region added successfully",
      region: newRegion
    });
  } catch (err) {
    next(err);
  }
};

exports.toggleRegionBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isBookingAllowed, name, description } = req.body;

    const region = await RegionModel.findById(id);
    if (!region) {
      return next(new AppError("Region not found", 404));
    }

    if (isBookingAllowed !== undefined) {
      region.isBookingAllowed = Boolean(isBookingAllowed);
    }
    if (name) {
      region.name = name.trim();
      region.code = normalizeRegionName(region.name) || region.name.toLowerCase().replace(/\s+/g, "_");
    }
    if (description !== undefined) {
      region.description = description.trim();
    }

    await region.save();

    res.status(200).json({
      success: true,
      message: "Region updated successfully",
      region
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteManagedRegion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const region = await RegionModel.findByIdAndDelete(id);
    if (!region) {
      return next(new AppError("Region not found", 404));
    }

    res.status(200).json({
      success: true,
      message: "Region deleted successfully"
    });
  } catch (err) {
    next(err);
  }
};
