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
const BOOKING_STATUS = require("../enum/bookingstatus.enum");
const PartRequest = require('../models/partsrequest.model');
const PART_REQUEST_STATUS = require('../enum/partsstatus.enum');
const User = require('../models/user.model');
const Review = require('../models/review.model');

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
    } s
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

      service.serviceCategory.push({
        serviceCategoryName,
        description,
        price,
        durationInMinutes,
        employeeCount,
        servicecategoryImage: imageUrl
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
          servicecategoryImage: imageUrl
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
    const upload = await cloudinary.uploader.upload(
      domainpartimage,
      {
        folder: "domain_parts",
        resource_type: "image"
      }
    );

    /* ===============================
       CREATE DOCUMENT
    =============================== */
    const domainPart = await Domainparts.create({
      domainpartname: domainpartname.trim(),
      domainpartimage: upload.secure_url,
      domainpartimagePublicId: upload.public_id,
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
    if (domainpartimage) {
      // Delete old image
      if (domainPart.domainpartimagePublicId) {
        await cloudinary.uploader.destroy(
          domainPart.domainpartimagePublicId
        );
      }

      // Upload new image
      const upload = await cloudinary.uploader.upload(
        domainpartimage,
        { folder: "domain_parts" }
      );

      domainPart.domainpartimage = upload.secure_url;
      domainPart.domainpartimagePublicId = upload.public_id;
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
    if (domainPart.domainpartimagePublicId) {
      await cloudinary.uploader.destroy(
        domainPart.domainpartimagePublicId
      );
    }

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
    const booking = await Booking.find();
    if (!booking || !booking.lenght === 0) {
      return next(new AppError("No booking Now", 400));
    }
    return res.status(200).json(booking);
  } catch (err) {
    next(err);
  }
}

exports.blockServicer = async (req, res, next) => {
  try {
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
      return res.json({ success: true, message: "Servicer unblocked successfully" });
    }

    const servicer = await model.findByIdAndUpdate(id, { isBlocked: false, blockedUntil: null }, { new: true });


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
    const [serviceRevenueStats, partRevenueStats] = await Promise.all([
      Booking.aggregate([
        { $match: { status: BOOKING_STATUS.COMPLETED } },
        { $group: { _id: null, total: { $sum: "$totalServicePrice" } } }
      ]),
      PartRequest.aggregate([
        { $match: { status: PART_REQUEST_STATUS.COLLECTED } },
        { $group: { _id: null, total: { $sum: "$totalCost" } } }
      ])
    ]);

    const totalServiceRevenue = serviceRevenueStats.length > 0 ? serviceRevenueStats[0].total : 0;
    const totalPartRevenue = partRevenueStats.length > 0 ? partRevenueStats[0].total : 0;
    const grandTotalRevenue = totalServiceRevenue + totalPartRevenue;

    // 3. Trends Aggregation Helper
    const getTrends = async (startDate, groupFormat) => {
      const [service, parts] = await Promise.all([
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
        ])
      ]);
      return { service, parts };
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

        merged[key] = { label, serviceRevenue: 0, partRevenue: 0, totalRevenue: 0 };
      }

      data.service.forEach(item => { if (merged[item._id]) { merged[item._id].serviceRevenue = item.serviceRevenue; merged[item._id].totalRevenue += item.serviceRevenue; } });
      data.parts.forEach(item => { if (merged[item._id]) { merged[item._id].partRevenue = item.partRevenue; merged[item._id].totalRevenue += item.partRevenue; } });

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



