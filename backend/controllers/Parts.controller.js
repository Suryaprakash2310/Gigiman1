const Domainparts= require('../models/domainparts.model');
const PartRequest = require("../models/partsrequest.model");


//Showcategories
exports.showCategories=async(req,res)=>{
  try{
    const categories=await Domainparts.aggregate([
      {$project:{_id:1,domaintoolname:1}},
      {$sort:{domaintooname:1}},
    ]);
    res.status(200).json({
      success:true,
      total:categories.length,
      categories,
    });
  }
  catch(err){
    console.error("Error loading categories",err.message);
    res.status(500).json({message:"Server error",error:err.message});
  }
};
//showparts
exports.showParts = async (req, res) => {
  try {
    const { jobId,categoriesId } = req.query;
    if (!jobId) {
      return res.status(400).json({ message: "Job must be created before viewing parts" });
    }
    if (!categoriesId) {
      return res.status(400).json({ message: "categories is required" });
    }

    const partsList=await Domainparts.aggregate([
      {
        $match:{_id:new mongoose.Types.objectId(categoriesId)}
      },
      {$unwind:"$parts"},
      {$sort:{"parts.partsname":1}},
      {
        $group:{
          _id:"$id",
          domaintoolname:{$first:"$domaintoolname"},
          parts:{$push:"$parts"},
        }
      }
    ])
    res.status(200).json({
      success: true,
      jobId,
      category:partsList[0]?.domaintoolname ||"",
      totlaparts:partsList[0]?.parts.length||0,
      parts:partsList[0]?.parts||[],
    });
  } catch (err) {
    console.error("Error showing parts:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
}

exports.searchDomainCategories = async (req, res) => {
  try {
    const { q = "" } = req.query;

    const domains = await Domainparts.aggregate([
      {
        $match: {
          domaintoolname: { $regex: q, $options: "i" },
        }
      },
      {
        $project: {
          domaintoolname: 1
        }
      },
      { $sort: { domaintoolname: 1 } }
    ]);

    res.status(200).json({
      success: true,
      count: domains.length,
      domains,
    });

  } catch (err) {
    console.error("Domain search error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.searchParts = async (req, res) => {
  try {
    const { domain = "", q = "" } = req.query;

    const partsList = await Domainparts.aggregate([
      {
        $match: {
          domaintoolname: { $regex: domain, $options: "i" },
        }
      },
      { $unwind: "$parts" },
      {
        $match: {
          "parts.partsname": { $regex: q, $options: "i" }
        }
      },
      {
        $group: {
          _id: "$_id",
          domaintoolname: { $first: "$domaintoolname" },
          parts: { $push: "$parts" },
        }
      },
      { $sort: { domaintoolname: 1 } }
    ]);

    res.status(200).json({
      success: true,
      count: partsList.length,
      parts: partsList,
    });

  } catch (err) {
    console.error("Parts search error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
exports.createPartRequest=async(req,res)=>{
    try{
        const{bookingId,employeeId,parts,totalCost}=req.body;
        const request=await PartRequest.create({
            bookingId,
            employeeId,
            parts,
            parts,
            totalCost,
            status:"required",
        });
        res.json({
            success:true,
            message:"parts required create",
            request
        });
    }
    catch(err){
        console.error("create parts request controller",err.message);
        res.status(200).json({mesage:"server error",error:err.message});
    }
}