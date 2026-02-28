const AppError = require('../utils/AppError');

/**
 * Middleware for validating request body/params/query against a Joi schema
 * @param {import('joi').Schema} schema 
 * @param {string} property - 'body', 'params', or 'query'
 */
const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error } = schema.validate(req[property], {
            abortEarly: false,
            allowUnknown: true,
            stripUnknown: true
        });

        if (error) {
            const message = error.details.map(i => i.message).join(', ');
            return next(new AppError(message, 400));
        }

        next();
    };
};

module.exports = validate;
