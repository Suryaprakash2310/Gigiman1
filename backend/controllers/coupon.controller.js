const Coupon = require('../models/coupon.model');

// Create a new coupon (Admin)
exports.createCoupon = async (req, res) => {
    try {
        const {
            code,
            discountType,
            discountValue,
            maxDiscount,
            minOrderValue,
            validFrom,
            validUntil,
            isActive,
            usageLimit
        } = req.body;

        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }

        const coupon = new Coupon({
            code,
            discountType,
            discountValue,
            maxDiscount,
            minOrderValue,
            validFrom,
            validUntil,
            isActive,
            usageLimit
        });

        await coupon.save();
        res.status(201).json({ success: true, message: 'Coupon created successfully', coupon });
    } catch (error) {
        console.error("Error creating coupon:", error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get all coupons (Admin)
exports.getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, coupons });
    } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update coupon (Admin)
exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const updatableFields = ['discountType', 'discountValue', 'maxDiscount', 'minOrderValue', 'validFrom', 'validUntil', 'isActive', 'usageLimit'];
        
        let updateData = {};
        for(let field of updatableFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        const coupon = await Coupon.findByIdAndUpdate(id, updateData, { new: true });
        
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        res.status(200).json({ success: true, message: 'Coupon updated', coupon });
    } catch (error) {
        console.error("Error updating coupon:", error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};


// Validate a coupon (User)
exports.validateCoupon = async (req, res) => {
    try {
        const { code, cartTotal } = req.body;

        if (!code) {
           return res.status(400).json({ success: false, message: "Coupon code is required" });
        }

        const coupon = await Coupon.findOne({ code: code.toUpperCase() });

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Invalid coupon code' });
        }

        if (!coupon.isActive) {
            return res.status(400).json({ success: false, message: 'This coupon is no longer active' });
        }

        const now = new Date();
        if (now < coupon.validFrom) {
            return res.status(400).json({ success: false, message: `This coupon is valid from ${new Date(coupon.validFrom).toLocaleDateString()}` });
        }

        if (now > coupon.validUntil) {
            return res.status(400).json({ success: false, message: 'This coupon has expired' });
        }

        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ success: false, message: 'This coupon usage limit has been reached' });
        }

        if (cartTotal !== undefined && cartTotal < coupon.minOrderValue) {
             return res.status(400).json({ success: false, message: `Minimum order value of ${coupon.minOrderValue} required for this coupon` });
        }

        // Calculate discount
        let discountAmount = 0;
        let finalTotal = cartTotal || 0;

        if (cartTotal !== undefined && cartTotal >= 0) {
            if (coupon.discountType === 'PERCENTAGE') {
                discountAmount = (cartTotal * coupon.discountValue) / 100;
                if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
                    discountAmount = coupon.maxDiscount;
                }
            } else { // FLAT
                discountAmount = coupon.discountValue;
            }
            
            if (discountAmount > cartTotal) {
                discountAmount = cartTotal;
            }
            finalTotal = cartTotal - discountAmount;
        }


        res.status(200).json({ 
            success: true, 
            message: 'Coupon is valid', 
            coupon: {
                _id: coupon._id,
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                maxDiscount: coupon.maxDiscount,
                minOrderValue: coupon.minOrderValue
            },
            discountAmount,
            finalTotal
        });

    } catch (error) {
        console.error("Error validating coupon:", error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
