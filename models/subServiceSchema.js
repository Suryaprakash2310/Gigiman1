const mongoose = require("mongoose");

const subServiceSchema = new mongoose.Schema({
  subservicename: { type: String, required: true },
  subserviceimageurl:{type:String,default:null},
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
}, { timestamps: true });

module.exports = mongoose.model("SubService", subServiceSchema);