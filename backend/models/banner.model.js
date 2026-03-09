const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
{
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    img: {
        type: String,
        required: true
    },
    publicId: {
        type: String,
        required: true
    }
},
{ timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);