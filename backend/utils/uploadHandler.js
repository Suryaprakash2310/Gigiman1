const cloudinary = require('../config/cloudinary');

exports.uploadToCloudinary = async (file, folder = 'Gigiman') => {
    if (!file) return null;
    try {
        const result = await cloudinary.uploader.upload(file.path, {
            folder: folder
        });
        return {
            url: result.secure_url,
            publicId: result.public_id
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw error;
    }
};

exports.deleteFromCloudinary = async (publicId) => {
    if (!publicId) return null;
    try {
        return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return null;
    }
};
