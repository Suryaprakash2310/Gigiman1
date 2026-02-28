const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errorResponse = {
    status: "error",
    message: message,
  };

  // Log the error
  logger.error(err);

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please log in again.";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Your token has expired. Please log in again.";
  }

  if (err.code === 11000) {
    statusCode = 400;
    message = `Duplicate field value entered: ${JSON.stringify(err.keyValue)}. Please use another value!`;
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Resource not found. Invalid ${err.path}: ${err.value}`;
  }

  res.status(statusCode).json({
    ...errorResponse,
    message: message,
    error: statusCode >= 500 ? "Server Error" : "Client Error",
    // Only include stack in non-production environments
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
}