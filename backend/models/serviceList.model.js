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
    serviceCategory: [{
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            auto: true
        },
        serviceCategoryName: {
            type: String,
            required: true,
        },
        servicecategoryImage: {
            type: String,
            default: null,
        },
        servicecategoryImagePublicId: {
            type: String,
            default: null,
        },
        description: {
            type: String,
            required: true,
        },
        price: {
            type: Number,
            required: true,
        },
        durationInMinutes: {
            type: Number,
            required: true
        },
        employeeCount: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["Available", "Coming Soon", "New Service"],
            default: "Available",
        },
    }]
}, { timestamps: true })

serviceListSchema.index({ DomainServiceId: 1, createdAt: 1 });
serviceListSchema.index({ "serviceCategory._id": 1 });

module.exports = mongoose.model("ServiceList", serviceListSchema);