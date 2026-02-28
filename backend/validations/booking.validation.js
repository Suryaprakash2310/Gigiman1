const Joi = require('joi');

const bookingSchemas = {
    autoAssignServicer: Joi.object({
        userId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
        serviceCategoryName: Joi.string().required(),
        address: Joi.string().optional(),
        coordinates: Joi.array().items(Joi.number()).length(2).optional(),
        serviceCount: Joi.number().integer().min(1).default(1)
    }).or('address', 'coordinates'),

    submitReview: Joi.object({
        rating: Joi.number().min(1).max(5).required(),
        comment: Joi.string().max(500).optional()
    })
};

module.exports = bookingSchemas;
