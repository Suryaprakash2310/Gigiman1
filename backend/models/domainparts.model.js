const mongoose = require('mongoose');

const domainPartSchema = mongoose.Schema({
    domainpartname:{
        type:String,
        required:true,
    },
    domainpartimage:{
        type:String,
        default:null,
    }
}, { timestamps: true });

// Fast search
domainPartSchema.index({ "parts.partName": "text" });
domainPartSchema.index({ domainPartsName: 1 });

module.exports = mongoose.model("Domainparts", domainPartSchema);
