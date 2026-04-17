const AppError = require("../utils/AppError");
const ROLES = require("../enum/role.enum");

exports.allowRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.role || !roles.includes(req.role)) {
            return next(new AppError("You do not have permission to perform this action", 403));
        }
        next();
    }
}

/**
 * Middleware to check for granular permissions among administrative roles.
 * The 'admin' role acts as a superuser with full access.
 */
exports.hasPermission = (permission) => {
    return (req, res, next) => {
        const adminRoles = [
            ROLES.ADMIN,
            ROLES.SUPER_ADMIN,
            ROLES.CITY_MANAGER,
            ROLES.OPERATIONS_MANAGER,
            ROLES.SUPPORT_EXECUTIVE
        ];

        if (!adminRoles.includes(req.role)) {
            return next(new AppError("Unauthorized access", 403));
        }

        // 'admin' and 'super_admin' roles have absolute bypass (superuser)
        if (req.role === ROLES.ADMIN || req.role === ROLES.SUPER_ADMIN) {
            return next();
        }

        // Ensure req.employee exists and has permissions for other administrative roles
        if (!req.employee || !req.employee.permissions) {
            return next(new AppError("Admin permissions not found", 403));
        }

        if (!req.employee.permissions.includes(permission)) {
            return next(new AppError(`Missing required permission: ${permission}`, 403));
        }

        next();
    }
}