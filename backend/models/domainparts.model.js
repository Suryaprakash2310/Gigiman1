const mongoose = require('mongoose');

const domainPartSchema = mongoose.Schema({
    
    partName: {
        type: String,
        required: true,
        unique: true
    },

    categoryName: {
        type: String, // Example: "Electrical", "AC Parts"
        required: true,
    },

    price: {
        type: Number,
        required: true,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

// FAST SEARCH
domainPartSchema.index({ partName: "text" });
domainPartSchema.index({ categoryName: 1 });

module.exports = mongoose.model("Domainparts", domainPartSchema);
