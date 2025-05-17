const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  servicename: { type: String, required: true, unique: true },
  serviceimageurl:{type:String,default:null},
}, { timestamps: true });

module.exports = mongoose.model("Service", serviceSchema);