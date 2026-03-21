const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
    },
    discountType: {
        type: String,
        enum: ['PERCENTAGE', 'FLAT'],
        required: true,
        default: 'PERCENTAGE'
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscount: {
        type: Number,
        default: null // Applicable for PERCENTAGE discounts
    },
    minOrderValue: {
        type: Number,
        default: 0
    },
    validFrom: {
        type: Date,
        required: true
    },
    validUntil: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usageLimit: {
        type: Number,
        default: null // Null means unlimited
    },
    usedCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

couponSchema.index({ validFrom: 1, validUntil: 1, isActive: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
