const mongoose = require('mongoose');

const singleEmployeeSchema = new mongoose.Schema({
  fullname: {
    type: String,
    required: true,
  },
  phoneNo: {
    type: Number,
    required: true,
    unique: true,
  },
  address: {
    type: String,
    required: true,
    unique: true,
  },
  aadhaarNo: {
    type: Number,
    unique: true,
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model("SingleEmployee", singleEmployeeSchema);
