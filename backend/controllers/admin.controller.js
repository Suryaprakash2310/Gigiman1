const bcrypt=require('bcryptjs');
const Admin=require('../models/admin.model');
const jwt = require("jsonwebtoken");
const SingleEmployee = require('../models/singleEmployee.model');
const MultipleEmployee = require('../models/multipleEmployee.model');
const ToolShop=require('../models/toolshop.model');
const DomainService=require("../models/domainservice.model");
const cloudinary=require('../config/cloudinary');
const serviceList = require('../models/serviceList.model');
exports.adminLogin=async(req,res)=>{
    try{
        const {email,password}=req.body;
        const admin=await Admin.findOne({email});
        if(!admin){
            return res.status(400).json({message:"Admin not found"});
        }
        const match=await admin.comparePassword(password);
        if(!match){
            return res.status(400).json({message:"Invalid password"});
        }
        const token=jwt.sign(
            {id:admin._id,role:"admin"},
            process.env.JWT_KEY,
            {expiresIn:"7d"}
        );
        res.json({
            message:"Admin login successfully",
            token,
            admin:{
                id:admin._id,
                fullname:admin.fullname,
                email:admin.email,
                role:admin.role,
            }
        });
    }
    catch(err){
        console.error("Admin Login controller error",err.message);
        res.status(500).json({
            message:"server Error",
            error:err.message
        });
    }
}

exports.checkAuth=async(req,res)=>{
    if(req.role!='admin'){
        return res.status(403).json({message:"Access denied"});
    }
    res.json({
        isAuthenticated:true,
        admin:req.employee,
    });
}

exports.getEmployeecounts=async(req,res)=>{
    try{
        const SingleEmployeeCount=await SingleEmployee.countDocuments();
        const MultipleEmployeeCount=await MultipleEmployee.countDocuments();
        const toolShopCount=await ToolShop.countDocuments();

        const total=SingleEmployeeCount+MultipleEmployeeCount+toolShopCount;

        res.json({
            singleEmployee:SingleEmployeeCount,
            mulipleEmplyee:MultipleEmployeeCount,
            toolshop:toolShopCount,
            totalemp:total
        })
    }catch(err){
        console.error("Employee count controller error",err.message);
        res.status(500).json({message:"Sever Error"});
    }
}

exports.Adddomainservice=async(req,res)=>{
    try{
        const {domainName,serviceImage}=req.body;
        if(!domainName||!serviceImage){
        return res.status(400).json({message:"All the fields are required"});
    }
    const existingDomain = await DomainService.findOne({ domainName });

    if (existingDomain) {
      return res.status(409).json({
        message: "Domain service already exists",
        existing: existingDomain,
      });
    }
    const uploadImage=await cloudinary.uploader.upload(serviceImage,{
        folder:"Domain_service",
        resource_type:"image",
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
    catch(err){
        console.error("Add domain service controller error",err.message);
        res.status(500).json({message:"Server error",error:err.message});
    }
}

exports.AddServiceList=async(req,res)=>{
    try{
        const{DomainServiceId,serviceName,description,price,durationInMinutes}=req.body;
        if(!DomainServiceId||!serviceName||!description||!price||!durationInMinutes){
            return res.status(400).json({message:"All fields are requried"});
        }
        const existingDomain=DomainService.findOne({DomainServiceId});
        if(!existingDomain){
            return res.status(400).json({message:"Domain is not found"});
        }
        const newService=serviceList.create({
            DomainServiceId,
            serviceName,
            description,
            price,
            durationInMinutes
        })
        return res.status(200).json({
            message:"ServiceList is added",
            service:newService,
        })
    }
    catch(err){
        console.error("AddServiceList controller error",err.message);
        res.status(500).json({message:"Server error",error:err.message});
    }
}