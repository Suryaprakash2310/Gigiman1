const cloudinary = require('../config/cloudinary');
const fs = require('fs');

exports.uploadToCloudinary = async (file, folder = 'Gigiman') => {
    if (!file) return null;
    try {
        // file could be a Multer file object (has .path) or a direct string (URL/base64)
        const filePath = file.path || file;
        
        const result = await cloudinary.uploader.upload(filePath, {
            folder: folder
        });

        // Clean up local file if it's from Multer
        if (file.path) {
            fs.unlink(file.path, (err) => {
                if (err) console.error('Error deleting local file:', err);
            });
        }

        return {
            url: result.secure_url,
            publicId: result.public_id
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        // Clean up even on error if possible
        if (file.path && fs.existsSync(file.path)) {
            fs.unlink(file.path, (err) => {
                if (err) console.error('Error deleting local file after upload error:', err);
            });
        }
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
