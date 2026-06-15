const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },

    items: [{
        domainService: {
            type: mongoose.Types.ObjectId,
            ref: "DomainService"
        },

        serviceCategoryId: mongoose.Types.ObjectId,

        serviceCategoryName: String,

        price: Number,

        durationInMinutes: Number,

        employeeCount: Number,

        quantity: {
            type: Number,
            default: 1
        },

        type: {
            type: String,
            enum: ["MAIN", "EXTRA"],
            default: "MAIN"
        }
    }],

    totalPrice: {
        type: Number,
        default: 0
    }

}, { timestamps: true });

module.exports = mongoose.model("Cart", cartSchema);