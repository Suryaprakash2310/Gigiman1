const cloudinary = require("../config/cloudinary");
const AppError = require("../utils/AppError");
const Banner = require('../models/banner.model');

exports.createBanner = async (req, res, next) => {
    try {
        const { title, description } = req.body;
        if (!title || !description || !req.file) {
            return next(new AppError("All fields including image are required", 400));
        }

        const banner = await Banner.create({
            title,
            description,
            img: req.file.path, // Cloudinary URL from multer-storage-cloudinary
            publicId: req.file.filename, // Cloudinary Public ID from multer-storage-cloudinary
        })
        res.status(201).json({
            success: true,
            banner,
        })
    }
    catch (err) {
        next(err);
    }
}

exports.updateBanner = async (req, res, next) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            return next(new AppError("Banner is not found", 404));
        }

        if (req.file) {
            // Delete old image
            if (banner.publicId) {
                await cloudinary.uploader.destroy(banner.publicId);
            }
            banner.img = req.file.path;
            banner.publicId = req.file.filename;
        }
        banner.title = req.body.title || banner.title;
        banner.description = req.body.description || banner.description;
        await banner.save();

        res.json({
            success: true,
            banner
        })
    }
    catch (err) {
        next(err);
    }
}

exports.deleteBanner = async (req, res, next) => {
    try {
        const banner = await Banner.findById(req.params.id);

        if (!banner) {
            return res.status(404).json({ message: "Banner not found" });
        }

        await cloudinary.uploader.destroy(banner.publicId);

        await banner.deleteOne();

        res.json({
            success: true,
            message: "Banner deleted"
        });

    }
    catch (err) {
        next(err);
    }
}

exports.getAllBanners = async (req, res, next) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: banners.length,
            banners
        });
    } catch (err) {
        next(err);
    }
};

exports.getSingleBanner = async (req, res, next) => {
    try {
        const banner = await Banner.findById(req.params.id);
        if (!banner) {
            return next(new AppError("Banner not found", 404));
        }
        res.status(200).json({
            success: true,
            banner
        });
    } catch (err) {
        next(err);
    }
};
