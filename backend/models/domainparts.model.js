const mongoose = require("mongoose");

const domainPartSchema = new mongoose.Schema({
  domainpartname: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index:true
  },

  domainpartimage: {
    type: String,
    default: null
  },

  domainpartimagePublicId: {
    type: String,
    default: null
  },

  parts: [
    {
      partName: {
        type: String,
        required: true,
        trim: true
      },
      price: {
        type: Number,
        required: true,
        min: 0
      }
    }
  ]
}, { timestamps: true });

/* ===============================
   INDEXES
=============================== */

module.exports = mongoose.model("Domainparts", domainPartSchema);
