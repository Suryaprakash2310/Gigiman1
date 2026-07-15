const ServiceList = require('../models/serviceList.model');
const Cart = require('../models/cart.model');
const AppError = require('../utils/AppError');

exports.addToCart = async (req, res, next) => {
    try {
        const userId = req.userId;
        const { serviceCategoryId, type, clearExist } = req.body;

        if (!serviceCategoryId) {
            throw new AppError("serviceCategoryId is required", 400);
        }

        const serviceList = await ServiceList.findOne({
            "serviceCategory._id": serviceCategoryId
        });

        if (!serviceList) {
            throw new AppError("Service category not found", 404);
        }

        const category = serviceList.serviceCategory.find(
            s => s._id.toString() === serviceCategoryId
        );

        if (!category) {
            throw new AppError("Service category detail not found", 404);
        }

        // Check if service or parent domain is "Coming Soon"
        const DomainService = require('../models/domainservice.model');
        const domain = await DomainService.findById(serviceList.DomainServiceId);
        if (domain && domain.status === "Coming Soon") {
            throw new AppError("This service category is coming soon and cannot be added to the cart", 400);
        }

        if (category.status === "Coming Soon") {
            throw new AppError("This service is coming soon and cannot be added to the cart", 400);
        }

        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            cart = await Cart.create({
                user: userId,
                items: []
            });
        }



        const existingItem = cart.items.find(
            item => item.serviceCategoryId.toString() === serviceCategoryId
        );

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.items.push({
                domainService: serviceList.DomainServiceId,
                serviceCategoryId: category._id,
                serviceCategoryName: category.serviceCategoryName,
                price: category.price,
                durationInMinutes: category.durationInMinutes,
                employeeCount: category.employeeCount,
                quantity: 1,
                type: type || "MAIN"
            });
        }

        cart.totalPrice = cart.items.reduce(
            (sum, item) => sum + (item.price * item.quantity),
            0
        );

        await cart.save();

        res.json({
            success: true,
            cart
        });

    } catch (err) {
        next(err);
    }
};

exports.removeFromCart = async (req, res, next) => {
    try {
        const userId = req.userId;
        const { serviceCategoryId, removeAll } = req.body;

        if (!serviceCategoryId) {
            throw new AppError("serviceCategoryId is required", 400);
        }

        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            throw new AppError("Cart not found", 404);
        }

        const itemIndex = cart.items.findIndex(
            item => item.serviceCategoryId.toString() === serviceCategoryId
        );

        if (itemIndex === -1) {
            throw new AppError("Item not found in cart", 404);
        }

        const item = cart.items[itemIndex];
        if (removeAll || item.quantity <= 1) {
            cart.items.splice(itemIndex, 1);
        } else {
            item.quantity -= 1;
        }

        cart.totalPrice = cart.items.reduce(
            (sum, item) => sum + (item.price * item.quantity),
            0
        );

        await cart.save();

        res.json({
            success: true,
            cart
        });

    } catch (err) {
        next(err);
    }
};

exports.getCart = async (req, res, next) => {
    try {
        const cart = await Cart.findOne({
            user: req.userId
        }).populate("items.domainService", "domainName");

        if (!cart) {
            return res.json({
                success: true,
                cart: {
                    items: [],
                    totalPrice: 0
                }
            });
        }

        res.json({
            success: true,
            cart
        });

    } catch (err) {
        next(err);
    }
};

exports.getSuggestions = async (req, res, next) => {
    try {
        const cart = await Cart.findOne({
            user: req.userId
        });

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        const domainId = cart.items[0].domainService;

        const services = await ServiceList.find({
            DomainServiceId: domainId
        });

        res.json({
            success: true,
            suggestions: services
        });

    } catch (err) {
        next(err);
    }
};