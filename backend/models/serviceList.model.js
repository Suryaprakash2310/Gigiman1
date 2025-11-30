const mongoose = require('mongoose');

const serviceListSchema = mongoose.Schema({
    DomainServiceId: {
        type: mongoose.Types.ObjectId,
        ref: "DomainService",
        required: true,
    },
    serviceName: {
        type: String,
        required: true,
    },
    serviceName: {
        type: String,
        required: true,
    },
    price: {
        type: String,
        required: true,
    },
    durationInMinutes: {
        type: Number,
        required: true
    }

}, { timestamps: true })

module.exports = mongoose.model("ServiceList", serviceListSchema);