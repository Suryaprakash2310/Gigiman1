const mongoose = require('mongoose');

const domainPartSchema = mongoose.Schema({
    domainPartsName: {
        type: String, 
        required: true,
    },

    parts: [
        {
            partName: {
                type: String,
                required: true,
            },
            price: {
                type: Number,
                required: true,
                min: 0,
            },
            // isActive: {
            //     type: Boolean,
            //     default: true,
            // }
        }
    ],

}, { timestamps: true });

// Fast search
domainPartSchema.index({ "parts.partName": "text" });
domainPartSchema.index({ domainPartsName: 1 });

module.exports = mongoose.model("Domainparts", domainPartSchema);
