const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const sharp = require('sharp');

exports.uploadToCloudinary = async (file, folder = 'Gigiman') => {
    if (!file) return null;
    const filePath = file.path || file;
    const compressedPath = filePath + '-compressed.webp';
    let uploadPath = filePath;
    let isCompressed = false;

    try {
        // If file is from Multer, compress it locally first using sharp
        if (file.path && fs.existsSync(filePath)) {
            try {
                await sharp(filePath)
                    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toFile(compressedPath);
                uploadPath = compressedPath;
                isCompressed = true;
            } catch (sharpError) {
                console.error('Sharp image compression failed, falling back to original upload:', sharpError);
            }
        }
        
        const result = await cloudinary.uploader.upload(uploadPath, {
            folder: folder
        });

        // Clean up original file if from Multer
        if (file.path && fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting original local file:', err);
            });
        }

        // Clean up compressed temp file if created
        if (isCompressed && fs.existsSync(compressedPath)) {
            fs.unlink(compressedPath, (err) => {
                if (err) console.error('Error deleting compressed local file:', err);
            });
        }

        // Optimize secure url via Cloudinary dynamic transformation (f_auto,q_auto)
        const optimizedUrl = result.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');

        return {
            url: optimizedUrl,
            publicId: result.public_id
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        
        // Ensure cleanup happens on error
        if (file.path && fs.existsSync(filePath)) {
            fs.unlink(filePath, (err) => {
                if (err) console.error('Error deleting original file after upload error:', err);
            });
        }
        if (fs.existsSync(compressedPath)) {
            fs.unlink(compressedPath, (err) => {
                if (err) console.error('Error deleting compressed file after upload error:', err);
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
