const Admin = require('../models/admin.model');
const jwt = require("jsonwebtoken");
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop = require('../models/toolshop.model');
const DomainService = require("../models/domainservice.model");
const cloudinary = require('../config/cloudinary');
const ServiceList = require('../models/serviceList.model');
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
      { id: admin._id, role: "admin" },
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

exports.SetSubService = async (req, res) => {
  try {
    const { DomainServiceId, serviceName, ServiceCategory } = req.body;

    if (!DomainServiceId || !serviceName) {
      return res.status(400).json({ message: "All fields required" });
    }

    if (
      !ServiceCategory?.serviceCategoryName ||
      !ServiceCategory?.description ||
      !ServiceCategory?.price ||
      !ServiceCategory?.durationInMinutes ||
      !ServiceCategory?.servicecategoryImage ||
      !ServiceCategory?.employeeCount
    ) {
      return res.status(400).json({ message: "Servicecategory field is required" });
    }

    // Upload image to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      ServiceCategory.servicecategoryImage,
      { folder: "service_categories" }
    );

    ServiceCategory.servicecategoryImage = uploadResult.secure_url;

    // Check existing service
    const existingService = await ServiceList.findOne({ serviceName });

    if (existingService) {
      const categoryExists = existingService.serviceCategory.some(
        (item) =>
          item.serviceCategoryName === ServiceCategory.serviceCategoryName
      );

      if (categoryExists) {
        return res.status(400).json({
          message: "This service category already exists",
        });
      }

      existingService.serviceCategory.push(ServiceCategory);
      await existingService.save();

      return res.status(200).json({
        success: true,
        message: "Category added successfully to existing service",
        data: existingService,
      });
    }

    const newService = await ServiceList.create({
      DomainServiceId,
      serviceName,
      serviceCategory: [ServiceCategory],
    });

    return res.status(201).json({
      success: true,
      message: "New service created with category",
      data: newService,
    });

  } catch (err) {
    console.error("SetSubService error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.getAllEmployee=async(req,res)=>{
  try{
    const singleemployee=await SingleEmployee.find().sort({createdAt:-1});
    const multipleEmployee=await MultipleEmployee.find().sort({createdAt:-1});
    const toolshop=await ToolShop.find().sort({createdAt:-1});

    const employee=[
      ...singleemployee.map(e=>({...e.toObject(),employeeType:"single_employee"})),
      ...multipleEmployee.map(e=>({...e.toObject(),employeeType:"multiple_employee"})),
      ...toolshop.map(e=>({...e.toObject(),employeeType:"tool_shop"}))
    ]
    employee.sort((a,b)=>b.createdAt - a.createdAt);
    res.json({success:true,employee});
  }
  catch(err){
    console.error("Get all employees error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
}

exports.DeleteDomainService=async (req, res) => {
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