const Domainparts = require('../models/domainparts.model');
const PartRequest = require("../models/partsrequest.model");

const mongoose = require("mongoose");
const AppError = require('../utils/AppError');

//Showcategories
exports.showCategories = async (req, res, next) => {
  try {
    const categories = await Domainparts.aggregate([
      { $project: { _id: 1, domainPartsName: 1 } },
      { $sort: { domainPartsName: 1 } },
    ]);
    if(!categories || categories.length === 0){
      return next(new AppError("No categories found", 404));
    }
    res.status(200).json({
      success: true,
      total: categories.length,
      categories,
    });
  }
  catch (err) {
    next(err); //let Global error handler deal with it
  }
};
//showparts
exports.showParts = async (req, res, next) => {
  try {
    const { jobId, categoriesId } = req.query;
    if (!jobId) {
      return next(new AppError("Job must be created before viewing parts", 400));
    }
    if (!categoriesId) {
      return next(new AppError("categories is required", 400));
    }

    const partsList = await Domainparts.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(categoriesId) }
      },
      { $unwind: "$parts" },
      { $sort: { "parts.partsname": 1 } },
      {
        $group: {
          _id: "$_id",
          domaintoolname: { $first: "$domaintoolname" },
          parts: { $push: "$parts" },
        }
      }
    ])
    res.status(200).json({
      success: true,
      jobId,
      category: partsList[0]?.domaintoolname || "",
      totlaparts: partsList[0]?.parts.length || 0,
      parts: partsList[0]?.parts || [],
    });
  } catch (err) {
    next(err); //let Global error handler deal with it
  }
}

exports.searchDomainCategories = async (req, res, next) => {
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
    next(err); //let Global error handler deal with it
  }
};

exports.searchParts = async (req, res, next) => {
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
    next(err); //let Global error handler deal with it
  }
};
exports.createPartRequest = async (req, res, next) => {
  try {
    const { bookingId, employeeId, parts, totalCost } = req.body;
    if(!bookingId || !employeeId || !parts || parts.length === 0 || !totalCost){
      return next(new AppError("All fields are required", 400));
    }
    const request = await PartRequest.create({
      bookingId,
      employeeId,
      parts,
      parts,
      totalCost,
      status: PART_REQUESTED_STATUS.REQUESTED,
    });
    if(!request){
      return next(new AppError("Failed to create part request", 500));
    }
    res.json({
      success: true,
      message: "parts required create",
      request
    });
  }
  catch (err) {
    next(err); //let Global error handler deal with it
  }
}