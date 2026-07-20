const mongoose = require('mongoose');

const regionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    isBookingAllowed: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        default: ""
    }
}, { timestamps: true });

module.exports = mongoose.model("Region", regionSchema);
